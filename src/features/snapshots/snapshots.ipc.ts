/**
 * snapshots.ipc.ts -- IPC handler registration for the database snapshots feature.
 */

import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS, SnapshotInfo } from '../../shared/types';
import { scanSnapshots, takeSnapshot, restoreSnapshot, deleteSnapshot } from './snapshots.service';

export interface SnapshotsIpcDeps {
	wpCli: LocalMain.Services.WpCli;
	siteData: LocalMain.Services.SiteDataService;
	siteDatabase: LocalMain.Services.SiteDatabase;
	logger: { info: ( msg: string ) => void; warn: ( msg: string ) => void };
}

/**
 * Registers all IPC listeners for the snapshots feature.
 *
 * @param deps - Service dependencies injected from main.ts.
 */
export function registerSnapshotsIpc( deps: SnapshotsIpcDeps ): void {
	const { wpCli, siteData, siteDatabase, logger } = deps;
	const appState = LocalMain.getServiceContainer().cradle.appState;

	// GET_SITE_STATUS -- Returns the current site status from appState.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_SITE_STATUS,
		async ( siteId: string ): Promise<string> => {
			const statuses = appState.getState().siteStatuses || {};
			return statuses[ siteId ] || 'halted';
		},
	);

	// SCAN_SNAPSHOTS -- Lists all .zip snapshots in app/sql/. Returns [] on error.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.SCAN_SNAPSHOTS,
		async ( siteId: string ): Promise<SnapshotInfo[]> => {
			const site = siteData.getSite( siteId );
			try {
				return await scanSnapshots( site as unknown as Local.Site );
			} catch ( e: any ) {
				logger.warn( `Failed to scan snapshots for site ${ siteId }: ${ e.message }` );
				return [];
			}
		},
	);

	// TAKE_SNAPSHOT -- Creates a new snapshot. Errors propagate to the renderer.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.TAKE_SNAPSHOT,
		async ( siteId: string, name: string ): Promise<SnapshotInfo> => {
			const site = siteData.getSite( siteId );
			logger.info( `Taking snapshot for site ${ siteId }, site.path="${ ( site as any ).path }", name="${ name }"` );
			try {
				const snapshot = await takeSnapshot( siteDatabase, wpCli, site as unknown as Local.Site, name );
				logger.info( `Created snapshot "${ snapshot.name }" for site ${ siteId }` );
				return snapshot;
			} catch ( e: any ) {
				logger.warn( `Failed to take snapshot for site ${ siteId }: ${ e.message }\n${ e.stack }` );
				throw e;
			}
		},
	);

	// RESTORE_SNAPSHOT -- Restores a database from a .zip snapshot.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.RESTORE_SNAPSHOT,
		async ( siteId: string, filename: string ): Promise<{ success: boolean }> => {
			const site = siteData.getSite( siteId );
			await restoreSnapshot( siteDatabase, site as unknown as Local.Site, filename );
			logger.info( `Restored snapshot "${ filename }" for site ${ siteId }` );
			return { success: true };
		},
	);

	// DELETE_SNAPSHOT -- Deletes a .zip snapshot file from app/sql/.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.DELETE_SNAPSHOT,
		async ( siteId: string, filename: string ): Promise<{ success: boolean }> => {
			const site = siteData.getSite( siteId );
			await deleteSnapshot( site as unknown as Local.Site, filename );
			logger.info( `Deleted snapshot "${ filename }" for site ${ siteId }` );
			return { success: true };
		},
	);
}
