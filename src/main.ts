/**
 * main.ts -- Main Process Entry Point for the WordPress Supercharged Addon
 *
 * This is a thin wiring shell. It extracts dependencies from Local's service
 * container and delegates to feature-specific registration functions.
 *
 * To add a new feature, import its registration function and call it here.
 */

import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS, FEATURE_FLAGS } from './shared/types';
import { registerDebugConstantsIpc } from './features/debug-constants/debug-constants.ipc';
import { registerNgrokIpc } from './features/ngrok/ngrok.ipc';
import { registerProfilerSetupIpc } from './features/profiler-setup/profiler-setup.ipc';
import { registerConflictTestIpc } from './features/conflict-test/conflict-test.ipc';
import { stopNgrokProcess } from './features/ngrok/ngrok.process';
import { readNgrokCache, writeNgrokCache } from './features/ngrok/ngrok.service';

export default function (context: LocalMain.AddonMainContext): void {
	const { wpCli, siteData, localLogger, lightningServices, siteProcessManager } = LocalMain.getServiceContainer().cradle;

	const logger = localLogger.child({
		thread: 'main',
		addon: 'wordpress-supercharged',
	});

	registerDebugConstantsIpc({ wpCli, siteData, logger });
	registerNgrokIpc({ wpCli, siteData, logger });
	if (FEATURE_FLAGS.PROFILER) {
		registerProfilerSetupIpc({ siteData, lightningServices, siteProcessManager, logger });
	}
	registerConflictTestIpc({ wpCli, siteData, logger });

	context.hooks.addAction('siteStopped', (site: any) => {
		const cached = readNgrokCache(site);
		if (cached?.enabled) {
			stopNgrokProcess(site.id);
			writeNgrokCache(siteData, site.id, { enabled: false, url: cached.url });
			LocalMain.sendIPCEvent(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, site.id, 'stopped');
			LocalMain.sendIPCEvent(IPC_CHANNELS.NGROK_CHANGED, site.id, false);
			logger.info(`Stopped ngrok tunnel for site ${site.id} because site was stopped`);
		}
	});
}
