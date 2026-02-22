/**
 * debug-constants.ipc.ts — IPC handler registration for the debug constants feature.
 *
 * This is the "wiring" layer that connects the service functions and watcher
 * to IPC channels. It registers all four async IPC listeners that the renderer
 * communicates with.
 */

import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS, SuperchargedCache } from '../../shared/types';
import {
	fetchDebugConstants,
	setDebugConstant,
	readCache,
	writeCache,
	getWpConfigMtime,
} from './debug-constants.service';
import { createWatcherManager } from './debug-constants.watcher';

/**
 * Dependencies required by the IPC handlers.
 */
export interface IpcDeps {
	wpCli: LocalMain.Services.WpCli;
	siteData: LocalMain.Services.SiteDataService;
	logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

/**
 * Registers all IPC listeners for the debug constants feature.
 *
 * Creates a watcher manager and wires it together with the service functions.
 * After calling this function, the following IPC channels are active:
 *   - supercharged:watch-site
 *   - supercharged:unwatch-site
 *   - supercharged:get-debug-constants
 *   - supercharged:set-debug-constant
 *
 * @param deps — The service dependencies (wpCli, siteData, logger).
 */
export function registerDebugConstantsIpc(deps: IpcDeps): void {
	const { wpCli, siteData, logger } = deps;
	const watcher = createWatcherManager(deps);

	/**
	 * Start watching wp-config.php for a site.
	 * Called by the renderer when the DebugSwitches component mounts.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.WATCH_SITE,
		async (siteId: string) => {
			watcher.watchSite(siteId);
		},
	);

	/**
	 * Stop watching wp-config.php for a site.
	 * Called by the renderer when the DebugSwitches component unmounts.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.UNWATCH_SITE,
		async (siteId: string) => {
			watcher.unwatchSite(siteId);
		},
	);

	/**
	 * Get the current values of all debug constants.
	 *
	 * Implements a cache-first strategy:
	 * 1. If cached and wp-config.php hasn't been modified since → return cached.
	 * 2. Otherwise → fetch via WP-CLI, persist to cache, return fresh values.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_DEBUG_CONSTANTS,
		async (siteId: string) => {
			const site = siteData.getSite(siteId);
			const cached = readCache(site);

			if (cached?.debugConstants && cached.cachedAt >= getWpConfigMtime(site)) {
				logger.info(`Returning cached debug constants for site ${siteId}`);
				return cached.debugConstants;
			}

			const results = await fetchDebugConstants(wpCli, site);
			writeCache(siteData, siteId, results);

			logger.info(`Fetched and cached debug constants for site ${siteId}: ${JSON.stringify(results)}`);
			return results;
		},
	);

	/**
	 * Set a single debug constant in wp-config.php.
	 *
	 * Flow:
	 * 1. Mark self-writing to suppress the file watcher.
	 * 2. Run `wp config set` via WP-CLI.
	 * 3. Clear self-writing guard after 500ms.
	 * 4. Merge the new value into the existing cache.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.SET_DEBUG_CONSTANT,
		async (siteId: string, constant: string, value: boolean) => {
			const site = siteData.getSite(siteId);

			watcher.markSelfWriting(siteId);
			try {
				await setDebugConstant(wpCli, site, constant, value);
			} finally {
				watcher.clearSelfWriting(siteId);
			}

			const cached = readCache(site);
			const updatedCache = { ...cached?.debugConstants, [constant]: value };
			writeCache(siteData, siteId, updatedCache);

			logger.info(`Set ${constant} to ${value} for site ${siteId} and updated cache`);
			return { success: true };
		},
	);
}
