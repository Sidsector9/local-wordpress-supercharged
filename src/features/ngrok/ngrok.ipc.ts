/**
 * ngrok.ipc.ts -- IPC handler registration for the ngrok feature.
 *
 * This is the "wiring" layer that connects the service functions, process
 * manager, and IPC channels. It registers all seven async IPC listeners
 * that the renderer communicates with.
 *
 * Channels:
 *   - GET_NGROK:              Read cached ngrok state (enabled + URL)
 *   - APPLY_NGROK:            Save URL to cache (no wp-config.php changes)
 *   - ENABLE_NGROK:           Enable/disable (writes/removes wp-config.php constants)
 *   - CLEAR_NGROK:            Clear URL mapping and remove constants
 *   - START_NGROK_PROCESS:    Spawn the ngrok CLI for a site
 *   - STOP_NGROK_PROCESS:     Kill the ngrok CLI for a site
 *   - GET_NGROK_PROCESS_STATUS: Query whether the tunnel is running via the agent API
 */

import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS } from '../../shared/types';
import {
	setNgrokConstants,
	removeNgrokConstants,
	readNgrokCache,
	writeNgrokCache,
	clearNgrokCache,
	findConflictingSites,
} from './ngrok.service';
import {
	startNgrokProcess,
	stopNgrokProcess,
	getNgrokProcessStatus,
} from './ngrok.process';

/**
 * Dependencies required by the ngrok IPC handlers.
 */
export interface NgrokIpcDeps {
	wpCli: LocalMain.Services.WpCli;
	siteData: LocalMain.Services.SiteDataService;
	logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

/**
 * Registers all ngrok-related IPC listeners on the main process.
 *
 * Called once from main.ts during addon initialization. Each listener
 * pairs with a `LocalRenderer.ipcAsync()` call in the renderer.
 *
 * @param deps -- Service dependencies injected from main.ts.
 */
export function registerNgrokIpc(deps: NgrokIpcDeps): void {
	const { wpCli, siteData, logger } = deps;

	/**
	 * GET_NGROK -- Returns the cached ngrok state for a site.
	 *
	 * Called on component mount to initialize the UI.
	 * Returns { enabled: false, url: '' } if no cache exists.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_NGROK,
		async (siteId: string) => {
			const site = siteData.getSite(siteId);
			const cached = readNgrokCache(site);
			return {
				enabled: cached?.enabled ?? false,
				url: cached?.url ?? '',
			};
		},
	);

	/**
	 * APPLY_NGROK -- Saves the ngrok URL to cache without touching wp-config.php.
	 *
	 * Called when the user clicks "Save". The URL is persisted so it survives
	 * app restarts, but no wp-config.php constants are written until the user
	 * clicks "Start".
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.APPLY_NGROK,
		async (siteId: string, url: string) => {
			writeNgrokCache(siteData, siteId, { enabled: false, url });
			logger.info(`Saved ngrok URL for site ${siteId}: ${url}`);
		},
	);

	/**
	 * ENABLE_NGROK -- Enables or disables ngrok for a site.
	 *
	 * When enabling:
	 *   1. Resolve URL collisions (disable conflicting sites, remove their
	 *      wp-config.php constants, kill their processes, notify renderer).
	 *   2. Set WP_HOME and WP_SITEURL on the current site.
	 *   3. Update cache with enabled: true.
	 *
	 * When disabling:
	 *   1. Kill any running ngrok process for this site.
	 *   2. Remove WP_HOME and WP_SITEURL from wp-config.php.
	 *   3. Update cache with enabled: false (URL preserved for re-enabling).
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.ENABLE_NGROK,
		async (siteId: string, enabled: boolean, url: string) => {
			const site = siteData.getSite(siteId);

			if (enabled) {
				const conflicting = findConflictingSites(siteData, url, siteId);

				for (const conflictId of conflicting) {
					const conflictSite = siteData.getSite(conflictId);
					const conflictNgrok = readNgrokCache(conflictSite);

					stopNgrokProcess(conflictId);
					await removeNgrokConstants(wpCli, conflictSite);
					writeNgrokCache(siteData, conflictId, {
						enabled: false,
						url: conflictNgrok?.url ?? '',
					});

					logger.info(`Disabled ngrok on site ${conflictId} due to URL collision with site ${siteId}`);
					LocalMain.sendIPCEvent(IPC_CHANNELS.NGROK_CHANGED, conflictId, false);
					LocalMain.sendIPCEvent(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, conflictId, 'stopped');
				}

				await setNgrokConstants(wpCli, site, url);
				writeNgrokCache(siteData, siteId, { enabled: true, url });
				logger.info(`Enabled ngrok for site ${siteId} with URL ${url}`);
			} else {
				stopNgrokProcess(siteId);
				await removeNgrokConstants(wpCli, site);
				writeNgrokCache(siteData, siteId, { enabled: false, url });
				logger.info(`Disabled ngrok for site ${siteId}`);
			}
		},
	);

	/**
	 * CLEAR_NGROK -- Clears the ngrok URL mapping entirely.
	 *
	 * Kills any running process, removes wp-config.php constants if enabled,
	 * and removes the ngrok key from the SiteJSON cache.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.CLEAR_NGROK,
		async (siteId: string) => {
			const site = siteData.getSite(siteId);
			const cached = readNgrokCache(site);

			stopNgrokProcess(siteId);

			if (cached?.enabled) {
				await removeNgrokConstants(wpCli, site);
			}

			clearNgrokCache(siteData, siteId);
			logger.info(`Cleared ngrok mapping for site ${siteId}`);
		},
	);

	/**
	 * START_NGROK_PROCESS -- Spawns the ngrok CLI process for a site.
	 *
	 * Reads the cached URL, resolves the site's domain and HTTP port,
	 * and delegates to startNgrokProcess() which handles checking the
	 * agent API for existing tunnels before spawning.
	 *
	 * On success, pushes a NGROK_PROCESS_STATUS_CHANGED event with 'running'.
	 * If the process exits later (clean or error), the onExit callback pushes
	 * a 'stopped' event with an optional error message.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.START_NGROK_PROCESS,
		async (siteId: string) => {
			const site = siteData.getSite(siteId);
			const cached = readNgrokCache(site);

			if (!cached?.url) {
				throw new Error(`No ngrok URL configured for site ${siteId}`);
			}

			const siteDomain = (site as any).domain as string;
			const httpPort = (site as any).httpPort ?? 80;

			await startNgrokProcess(siteId, cached.url, siteDomain, httpPort, (exitedSiteId, error) => {
				LocalMain.sendIPCEvent(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, exitedSiteId, 'stopped', error);
				if (error) {
					logger.warn(`ngrok process failed for site ${exitedSiteId}: ${error}`);
				} else {
					logger.info(`ngrok process exited for site ${exitedSiteId}`);
				}
			});

			LocalMain.sendIPCEvent(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, siteId, 'running');
			logger.info(`Started ngrok process for site ${siteId}`);
		},
	);

	/**
	 * STOP_NGROK_PROCESS -- Kills the ngrok CLI process for a site.
	 *
	 * Pushes a NGROK_PROCESS_STATUS_CHANGED event with 'stopped' so
	 * the renderer updates the status indicator immediately.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.STOP_NGROK_PROCESS,
		async (siteId: string) => {
			stopNgrokProcess(siteId);
			LocalMain.sendIPCEvent(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, siteId, 'stopped');
			logger.info(`Stopped ngrok process for site ${siteId}`);
		},
	);

	/**
	 * GET_NGROK_PROCESS_STATUS -- Returns whether the tunnel is running.
	 *
	 * Queries the ngrok agent API for a tunnel matching this site's URL.
	 * Only reports 'running' if the site also has ngrok enabled in cache,
	 * so that sites sharing the same URL don't all show "Tunnel active".
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_NGROK_PROCESS_STATUS,
		async (siteId: string) => {
			const site = siteData.getSite(siteId);
			const cached = readNgrokCache(site);
			return getNgrokProcessStatus(cached?.url, cached?.enabled);
		},
	);
}
