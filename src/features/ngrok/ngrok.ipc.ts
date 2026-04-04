/**
 * ngrok.ipc.ts -- IPC handler registration for the ngrok feature.
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

export interface NgrokIpcDeps {
	wpCli: LocalMain.Services.WpCli;
	siteData: LocalMain.Services.SiteDataService;
	logger: { info: ( msg: string ) => void; warn: ( msg: string ) => void };
}

export function registerNgrokIpc( deps: NgrokIpcDeps ): void {
	const { wpCli, siteData, logger } = deps;

	// GET_NGROK -- Returns cached ngrok state for a site.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_NGROK,
		async ( siteId: string ) => {
			const site = siteData.getSite( siteId );
			const cached = readNgrokCache( site );
			return {
				enabled: cached?.enabled ?? false,
				url: cached?.url ?? '',
			};
		},
	);

	// APPLY_NGROK -- Saves URL to cache without touching wp-config.php.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.APPLY_NGROK,
		async ( siteId: string, url: string ) => {
			writeNgrokCache( siteData, siteId, { enabled: false, url } );
			logger.info( `Saved ngrok URL for site ${ siteId }: ${ url }` );
		},
	);

	// ENABLE_NGROK -- Enables/disables ngrok (writes/removes wp-config.php constants).
	// Resolves URL collisions when enabling.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.ENABLE_NGROK,
		async ( siteId: string, enabled: boolean, url: string ) => {
			const site = siteData.getSite( siteId );

			if ( enabled ) {
				const conflicting = findConflictingSites( siteData, url, siteId );

				for ( const conflictId of conflicting ) {
					const conflictSite = siteData.getSite( conflictId );
					const conflictNgrok = readNgrokCache( conflictSite );

					stopNgrokProcess( conflictId );
					await removeNgrokConstants( wpCli, conflictSite );
					writeNgrokCache( siteData, conflictId, {
						enabled: false,
						url: conflictNgrok?.url ?? '',
					} );

					logger.info( `Disabled ngrok on site ${ conflictId } due to URL collision with site ${ siteId }` );
					LocalMain.sendIPCEvent( IPC_CHANNELS.NGROK_CHANGED, conflictId, false );
					LocalMain.sendIPCEvent( IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, conflictId, 'stopped' );
				}

				await setNgrokConstants( wpCli, site, url );
				writeNgrokCache( siteData, siteId, { enabled: true, url } );
				logger.info( `Enabled ngrok for site ${ siteId } with URL ${ url }` );
			} else {
				stopNgrokProcess( siteId );
				await removeNgrokConstants( wpCli, site );
				writeNgrokCache( siteData, siteId, { enabled: false, url } );
				logger.info( `Disabled ngrok for site ${ siteId }` );
			}
		},
	);

	// CLEAR_NGROK -- Clears the ngrok URL mapping entirely.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.CLEAR_NGROK,
		async ( siteId: string ) => {
			const site = siteData.getSite( siteId );
			const cached = readNgrokCache( site );

			stopNgrokProcess( siteId );

			if ( cached?.enabled ) {
				await removeNgrokConstants( wpCli, site );
			}

			clearNgrokCache( siteData, siteId );
			logger.info( `Cleared ngrok mapping for site ${ siteId }` );
		},
	);

	// START_NGROK_PROCESS -- Spawns the ngrok CLI process for a site.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.START_NGROK_PROCESS,
		async ( siteId: string ) => {
			const site = siteData.getSite( siteId );
			const cached = readNgrokCache( site );

			if ( ! cached?.url ) {
				throw new Error( `No ngrok URL configured for site ${ siteId }` );
			}

			const siteDomain = ( site as any ).domain as string;
			const httpPort = ( site as any ).httpPort ?? 80;

			await startNgrokProcess( siteId, cached.url, siteDomain, httpPort, ( exitedSiteId, error ) => {
				LocalMain.sendIPCEvent( IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, exitedSiteId, 'stopped', error );
				if ( error ) {
					logger.warn( `ngrok process failed for site ${ exitedSiteId }: ${ error }` );
				} else {
					logger.info( `ngrok process exited for site ${ exitedSiteId }` );
				}
			} );

			LocalMain.sendIPCEvent( IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, siteId, 'running' );
			logger.info( `Started ngrok process for site ${ siteId }` );
		},
	);

	// STOP_NGROK_PROCESS -- Kills the ngrok CLI process.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.STOP_NGROK_PROCESS,
		async ( siteId: string ) => {
			stopNgrokProcess( siteId );
			LocalMain.sendIPCEvent( IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, siteId, 'stopped' );
			logger.info( `Stopped ngrok process for site ${ siteId }` );
		},
	);

	// GET_NGROK_PROCESS_STATUS -- Queries whether the tunnel is running via agent API.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_NGROK_PROCESS_STATUS,
		async ( siteId: string ) => {
			const site = siteData.getSite( siteId );
			const cached = readNgrokCache( site );
			return getNgrokProcessStatus( cached?.url, cached?.enabled );
		},
	);
}
