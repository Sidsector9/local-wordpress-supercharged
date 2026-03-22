/**
 * profiler-setup.ipc.ts -- IPC handler registration for the profiler setup feature.
 *
 * This is the "wiring" layer that connects the service functions, lightning
 * services, and IPC channels. It registers two async IPC listeners that the
 * renderer communicates with.
 *
 * Channels:
 *   - GET_PROFILER_STATUS:  Check what profiler tools are installed
 *   - RUN_PROFILER_SETUP:   Run the full setup sequence (xhprof + k6)
 */

import * as path from 'path';
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS, ProfilerSetupStatus } from '../../shared/types';
import {
	checkXhprofCached,
	ensureXhprofSource,
	compileXhprof,
	installXhprofExtension,
	findExtensionDir,
	verifyXhprofInstalled,
	checkK6Installed,
	downloadAndInstallK6,
	deployMuPlugin,
	deployCliCommand,
	getProfilerStatus,
	writeProfilerCache,
} from './profiler-setup.service';

/**
 * Dependencies required by the profiler setup IPC handlers.
 */
export interface ProfilerSetupIpcDeps {
	siteData: LocalMain.Services.SiteDataService;
	lightningServices: LocalMain.Services.LightningServices;
	siteProcessManager: LocalMain.Services.SiteProcessManager;
	logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

/**
 * Extracts PHP binary paths from a LightningService instance.
 *
 * If phpize or php-config are not in the bin dictionary, we look for them
 * in the same directory as the php binary.
 */
function getPhpBins(phpService: LocalMain.LightningService): {
	php: string;
	phpize: string;
	phpConfig: string;
} {
	const bin = phpService.bin ?? {};
	const phpBin = bin['php'] ?? 'php';
	const phpDir = path.dirname(phpBin);

	return {
		php: phpBin,
		phpize: bin['phpize'] ?? path.join(phpDir, 'phpize'),
		phpConfig: bin['php-config'] ?? path.join(phpDir, 'php-config'),
	};
}

/**
 * Registers all profiler-setup-related IPC listeners on the main process.
 *
 * Called once from main.ts during addon initialization. Each listener
 * pairs with a `LocalRenderer.ipcAsync()` call in the renderer.
 *
 * @param deps -- Service dependencies injected from main.ts.
 */
export function registerProfilerSetupIpc(deps: ProfilerSetupIpcDeps): void {
	const { siteData, lightningServices, siteProcessManager, logger } = deps;

	/**
	 * GET_PROFILER_STATUS -- Returns the installation status of all
	 * profiler tools for a site.
	 *
	 * Called on component mount to determine whether to show the
	 * "Setup" button or the "Ready" indicator.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_PROFILER_STATUS,
		async (siteId: string): Promise<ProfilerSetupStatus> => {
			const site = siteData.getSite(siteId);
			const phpService = lightningServices.getSiteServiceByRole(
				site as unknown as Local.Site,
				Local.SiteServiceRole.PHP,
			);

			if (!phpService) {
				return {
					xhprof: { status: 'error', error: 'PHP service not found for this site' },
					k6: (await checkK6Installed()),
					muPlugin: { status: 'missing' },
				};
			}

			const { phpize } = getPhpBins(phpService);
			const phpPrefix = path.dirname(path.dirname(phpize));
			const extDir = await findExtensionDir(phpPrefix);

			return getProfilerStatus(
				extDir,
				site as unknown as Local.Site,
				phpService.binVersion,
			);
		},
	);

	/**
	 * RUN_PROFILER_SETUP -- Runs the full profiler setup sequence.
	 *
	 * 1. xhprof: check cache -> clone source -> compile -> write ini -> restart PHP -> verify
	 * 2. k6: check installed -> download -> verify
	 *
	 * xhprof and k6 are independent -- one failing does not block the other.
	 * Progress is streamed to the renderer via PROFILER_SETUP_LOG push events.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.RUN_PROFILER_SETUP,
		async (siteId: string): Promise<ProfilerSetupStatus> => {
			const site = siteData.getSite(siteId);
			const phpService = lightningServices.getSiteServiceByRole(
				site as unknown as Local.Site,
				Local.SiteServiceRole.PHP,
			);

			const onLog = (msg: string) => {
				logger.info(msg);
				LocalMain.sendIPCEvent(IPC_CHANNELS.PROFILER_SETUP_LOG, siteId, msg);
			};

			let xhprofResult: ProfilerSetupStatus['xhprof'] = { status: 'missing' };
			let k6Result: ProfilerSetupStatus['k6'] = { status: 'missing' };
			let muPluginResult: ProfilerSetupStatus['muPlugin'] = { status: 'missing' };

			// -- xhprof setup --
			if (!phpService) {
				xhprofResult = { status: 'error', error: 'PHP service not found for this site' };
				onLog('Error: PHP service not found');
			} else if (process.platform === 'win32') {
				xhprofResult = { status: 'error', error: 'xhprof compilation requires macOS or Linux' };
				onLog('Skipping xhprof: compilation not supported on Windows');
			} else {
				const phpVersion = phpService.binVersion;
				const { php, phpize, phpConfig } = getPhpBins(phpService);
				const phpPrefix = path.dirname(path.dirname(phpize));
				const env = {
					...process.env,
					PATH: `${phpService.$PATH ?? ''}${path.delimiter}${process.env.PATH ?? ''}`,
				};

				try {
					// Step 1: Compile if not cached
					if (checkXhprofCached(phpVersion)) {
						onLog(`xhprof.so already cached for PHP ${phpVersion}`);
					} else {
						await ensureXhprofSource(onLog);
						await compileXhprof(phpVersion, phpize, phpConfig, env, onLog);
					}

					// Step 2: Copy .so to extension dir and update php.ini.hbs
					const extDir = await findExtensionDir(phpPrefix);
					if (!extDir) {
						throw new Error('Could not find PHP extension directory');
					}

					await installXhprofExtension(
						site as unknown as Local.Site,
						phpVersion,
						extDir,
						onLog,
					);

					// Step 3: Restart PHP to load the extension
					onLog('Restarting PHP service...');
					await siteProcessManager.restartSiteService(
						site as unknown as Local.Site,
						'php',
					);
					onLog('PHP service restarted');

					// Step 4: Verify
					xhprofResult = await verifyXhprofInstalled(extDir, site as unknown as Local.Site);
					if (xhprofResult.status === 'ready') {
						onLog('xhprof installed and configured');
					} else {
						onLog(`xhprof verification failed: ${xhprofResult.error}`);
					}
				} catch (e: any) {
					xhprofResult = { status: 'error', error: e.message };
					onLog(`xhprof setup failed: ${e.message}`);
					logger.warn(`xhprof setup failed for site ${siteId}: ${e.message}`);
				}
			}

			// -- k6 setup --
			try {
				const k6Check = await checkK6Installed();
				if (k6Check.status === 'ready') {
					onLog(`k6 already installed (${k6Check.version})`);
					k6Result = k6Check;
				} else {
					await downloadAndInstallK6(onLog);
					k6Result = await checkK6Installed();
					if (k6Result.status === 'ready') {
						onLog(`k6 ${k6Result.version} installed`);
					} else {
						onLog(`k6 verification failed: ${k6Result.error}`);
					}
				}
			} catch (e: any) {
				k6Result = { status: 'error', error: e.message };
				onLog(`k6 setup failed: ${e.message}`);
				logger.warn(`k6 setup failed for site ${siteId}: ${e.message}`);
			}

			// -- mu-plugin setup --
			try {
				await deployMuPlugin(site as unknown as Local.Site, onLog);
				muPluginResult = { status: 'ready', version: 'installed' };
			} catch (e: any) {
				muPluginResult = { status: 'error', error: e.message };
				onLog(`mu-plugin setup failed: ${e.message}`);
				logger.warn(`mu-plugin setup failed for site ${siteId}: ${e.message}`);
			}

			// -- CLI command setup --
			try {
				await deployCliCommand(onLog);
			} catch (e: any) {
				onLog(`CLI setup warning: ${e.message}`);
				logger.warn(`CLI setup failed for site ${siteId}: ${e.message}`);
			}

			const status: ProfilerSetupStatus = {
				xhprof: xhprofResult,
				k6: k6Result,
				muPlugin: muPluginResult,
			};

			// Persist setup state
			const phpVersion = phpService?.binVersion;
			const allReady = xhprofResult.status === 'ready'
				&& k6Result.status === 'ready'
				&& muPluginResult.status === 'ready';
			writeProfilerCache(siteData, siteId, {
				setupCompleted: allReady,
				phpVersion,
			});

			LocalMain.sendIPCEvent(IPC_CHANNELS.PROFILER_SETUP_COMPLETED, siteId, status);
			return status;
		},
	);
}
