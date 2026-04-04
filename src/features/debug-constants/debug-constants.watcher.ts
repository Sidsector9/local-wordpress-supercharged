/**
 * debug-constants.watcher.ts -- File watcher lifecycle for wp-config.php.
 *
 * Uses a factory pattern so the stateful Maps/Sets are encapsulated.
 * The selfWriting guard suppresses the watcher during addon-initiated writes.
 */

import * as fs from 'fs';
import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS } from '../../shared/types';
import { getWpConfigPath, fetchDebugConstants, writeCache } from './debug-constants.service';

export interface WatcherDeps {
	wpCli: LocalMain.Services.WpCli;
	siteData: LocalMain.Services.SiteDataService;
	logger: { info: ( msg: string ) => void; warn: ( msg: string ) => void };
}

export interface WatcherManager {
	watchSite: ( siteId: string ) => void;
	unwatchSite: ( siteId: string ) => void;
	markSelfWriting: ( siteId: string ) => void;
	clearSelfWriting: ( siteId: string, delayMs?: number ) => void;
}

export function createWatcherManager( deps: WatcherDeps ): WatcherManager {
	const { wpCli, siteData, logger } = deps;

	const watchers = new Map<string, fs.FSWatcher>();
	const selfWriting = new Set<string>();

	function watchSite( siteId: string ): void {
		if ( watchers.has( siteId ) ) {
			return;
		}

		const site = siteData.getSite( siteId );
		const configPath = getWpConfigPath( site );

		try {
			const watcher = fs.watch( configPath, async ( eventType ) => {
				if ( eventType !== 'change' || selfWriting.has( siteId ) ) {
					return;
				}

				logger.info( `wp-config.php changed externally for site ${ siteId }, refreshing` );

				const freshSite = siteData.getSite( siteId );
				const results = await fetchDebugConstants( wpCli, freshSite );
				writeCache( siteData, siteId, results );

				LocalMain.sendIPCEvent( IPC_CHANNELS.DEBUG_CONSTANTS_CHANGED, siteId, results );
			} );

			watchers.set( siteId, watcher );
		} catch ( e ) {
			logger.warn( `Could not watch wp-config.php for site ${ siteId }: ${ e }` );
		}
	}

	function unwatchSite( siteId: string ): void {
		const watcher = watchers.get( siteId );
		if ( watcher ) {
			watcher.close();
			watchers.delete( siteId );
		}
	}

	function markSelfWriting( siteId: string ): void {
		selfWriting.add( siteId );
	}

	function clearSelfWriting( siteId: string, delayMs = 500 ): void {
		setTimeout( () => selfWriting.delete( siteId ), delayMs );
	}

	return { watchSite, unwatchSite, markSelfWriting, clearSelfWriting };
}
