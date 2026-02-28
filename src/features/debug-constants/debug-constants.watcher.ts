/**
 * debug-constants.watcher.ts -- File watcher lifecycle for wp-config.php.
 *
 * Encapsulates the `fs.watch` watchers (one per site) and the `selfWriting`
 * guard that suppresses the watcher during addon-initiated writes.
 *
 * Uses a factory pattern (`createWatcherManager`) so the stateful Maps/Sets
 * are contained and the dependencies are explicit.
 */

import * as fs from 'fs';
import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS, DebugConstantsMap } from '../../shared/types';
import { getWpConfigPath, fetchDebugConstants, writeCache } from './debug-constants.service';

/**
 * Dependencies required by the watcher manager.
 */
export interface WatcherDeps {
	wpCli: LocalMain.Services.WpCli;
	siteData: LocalMain.Services.SiteDataService;
	logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

/**
 * The public interface returned by createWatcherManager.
 */
export interface WatcherManager {
	watchSite: (siteId: string) => void;
	unwatchSite: (siteId: string) => void;
	markSelfWriting: (siteId: string) => void;
	clearSelfWriting: (siteId: string, delayMs?: number) => void;
}

/**
 * Creates a watcher manager scoped to the given dependencies.
 *
 * The returned object exposes methods to start/stop file watchers per site
 * and to manage the self-writing guard. Internal state (the `watchers` Map
 * and `selfWriting` Set) is fully encapsulated.
 *
 * When an external change is detected on wp-config.php:
 *   1. Re-fetches all debug constants via WP-CLI.
 *   2. Updates the cache on the SiteJSON object.
 *   3. Pushes the new values to the renderer via `sendIPCEvent`.
 *
 * @param deps -- The service dependencies (wpCli, siteData, logger).
 * @returns    -- A WatcherManager with watch/unwatch/selfWriting methods.
 */
export function createWatcherManager(deps: WatcherDeps): WatcherManager {
	const { wpCli, siteData, logger } = deps;

	/** Active file watchers keyed by siteId. */
	const watchers = new Map<string, fs.FSWatcher>();

	/**
	 * Guard set to suppress the watcher during addon-initiated writes.
	 * Prevents the watcher from firing a redundant re-fetch when the addon
	 * itself runs `wp config set`, which would cause UI flicker.
	 */
	const selfWriting = new Set<string>();

	function watchSite(siteId: string): void {
		if (watchers.has(siteId)) {
			return;
		}

		const site = siteData.getSite(siteId);
		const configPath = getWpConfigPath(site);

		try {
			const watcher = fs.watch(configPath, async (eventType) => {
				if (eventType !== 'change') {
					return;
				}

				if (selfWriting.has(siteId)) {
					return;
				}

				logger.info(`wp-config.php changed externally for site ${siteId}, refreshing`);

				const freshSite = siteData.getSite(siteId);
				const results = await fetchDebugConstants(wpCli, freshSite);
				writeCache(siteData, siteId, results);

				LocalMain.sendIPCEvent(IPC_CHANNELS.DEBUG_CONSTANTS_CHANGED, siteId, results);
			});

			watchers.set(siteId, watcher);
		} catch (e) {
			logger.warn(`Could not watch wp-config.php for site ${siteId}: ${e}`);
		}
	}

	function unwatchSite(siteId: string): void {
		const watcher = watchers.get(siteId);
		if (watcher) {
			watcher.close();
			watchers.delete(siteId);
		}
	}

	function markSelfWriting(siteId: string): void {
		selfWriting.add(siteId);
	}

	function clearSelfWriting(siteId: string, delayMs = 500): void {
		setTimeout(() => selfWriting.delete(siteId), delayMs);
	}

	return { watchSite, unwatchSite, markSelfWriting, clearSelfWriting };
}
