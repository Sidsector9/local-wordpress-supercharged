/**
 * debug-constants.ipc.ts -- IPC handler registration for the debug constants feature.
 */

import * as LocalMain from '@getflywheel/local/main';
import { CACHE_VERSION, IPC_CHANNELS } from '../../shared/types';
import {
	fetchDebugConstants,
	setDebugConstant,
	deleteConstant,
	isConstantDefined,
	readCache,
	writeCache,
	getWpConfigMtime,
} from './debug-constants.service';
import { createWatcherManager } from './debug-constants.watcher';

export interface IpcDeps {
	wpCli: LocalMain.Services.WpCli;
	siteData: LocalMain.Services.SiteDataService;
	logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

export function registerDebugConstantsIpc(deps: IpcDeps): void {
	const { wpCli, siteData, logger } = deps;
	const watcher = createWatcherManager(deps);

	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.WATCH_SITE,
		async (siteId: string) => {
			watcher.watchSite(siteId);
		},
	);

	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.UNWATCH_SITE,
		async (siteId: string) => {
			watcher.unwatchSite(siteId);
		},
	);

	// Cache-first: return cached if wp-config.php hasn't changed, otherwise re-fetch via WP-CLI.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_DEBUG_CONSTANTS,
		async (siteId: string) => {
			const site = siteData.getSite(siteId);
			const cached = readCache(site);

			if (cached?.debugConstants && cached.cacheVersion === CACHE_VERSION && cached.cachedAt >= getWpConfigMtime(site)) {
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
	 * Special handling for WP_DEBUG_DISPLAY:
	 *   - Setting to true -> deletes from file (WP default is true).
	 *   - Setting to false -> writes to file (overrides WP default).
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.SET_DEBUG_CONSTANT,
		async (siteId: string, constant: string, value: boolean) => {
			const site = siteData.getSite(siteId);

			watcher.markSelfWriting(siteId);
			try {
				if (constant === 'WP_DEBUG_DISPLAY' && value === true) {
					const defined = await isConstantDefined(wpCli, site, constant);
					if (defined) {
						await deleteConstant(wpCli, site, constant);
					}
				} else {
					await setDebugConstant(wpCli, site, constant, value);
				}
			} finally {
				watcher.clearSelfWriting(siteId);
			}

			const results = await fetchDebugConstants(wpCli, site);
			writeCache(siteData, siteId, results);

			logger.info(`Set ${constant} to ${value} for site ${siteId} and updated cache`);
			return { success: true, constants: results };
		},
	);
}
