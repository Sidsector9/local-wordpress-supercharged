import 'jest-extended';
import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS } from '../../shared/types';
import { createMockSite, createMockSiteData, createMockWpCli, createMockLogger } from '../../test/mockCreators';
import { registerSnapshotsIpc } from './snapshots.ipc';
import * as service from './snapshots.service';

jest.mock( './snapshots.service' );

const mockService = service as jest.Mocked<typeof service>;

function createMockSiteDatabase() {
	return {
		dump: jest.fn().mockResolvedValue( undefined ),
		exec: jest.fn().mockResolvedValue( undefined ),
		waitForDB: jest.fn(),
		getTablePrefix: jest.fn(),
		runQuery: jest.fn(),
		listen: jest.fn(),
	};
}

describe( 'registerSnapshotsIpc', () => {
	let handlers: Record<string, Function>;
	let wpCli: ReturnType<typeof createMockWpCli>;
	let siteData: ReturnType<typeof createMockSiteData>;
	let siteDatabase: ReturnType<typeof createMockSiteDatabase>;
	let logger: ReturnType<typeof createMockLogger>;
	let site: ReturnType<typeof createMockSite>;

	beforeEach( () => {
		jest.clearAllMocks();

		site = createMockSite( { id: 'site-1' } );
		wpCli = createMockWpCli();
		siteData = createMockSiteData( site );
		siteDatabase = createMockSiteDatabase();
		logger = createMockLogger();

		( LocalMain.getServiceContainer as jest.Mock ).mockReturnValue( {
			cradle: {
				appState: {
					getState: jest.fn( () => ( { siteStatuses: { 'site-1': 'running' } } ) ),
				},
			},
		} );

		handlers = {};
		( LocalMain.addIpcAsyncListener as jest.Mock ).mockImplementation(
			( channel: string, handler: Function ) => {
				handlers[ channel ] = handler;
			},
		);

		registerSnapshotsIpc( { wpCli: wpCli as any, siteData: siteData as any, siteDatabase: siteDatabase as any, logger } );
	} );

	it( 'registers all IPC handlers', () => {
		expect( handlers[ IPC_CHANNELS.GET_SITE_STATUS ] ).toBeDefined();
		expect( handlers[ IPC_CHANNELS.SCAN_SNAPSHOTS ] ).toBeDefined();
		expect( handlers[ IPC_CHANNELS.TAKE_SNAPSHOT ] ).toBeDefined();
		expect( handlers[ IPC_CHANNELS.RESTORE_SNAPSHOT ] ).toBeDefined();
		expect( handlers[ IPC_CHANNELS.DELETE_SNAPSHOT ] ).toBeDefined();
	} );

	describe( 'GET_SITE_STATUS', () => {
		it( 'returns site status from appState', async () => {
			const result = await handlers[ IPC_CHANNELS.GET_SITE_STATUS ]( 'site-1' );
			expect( result ).toBe( 'running' );
		} );

		it( 'returns halted for unknown site', async () => {
			const result = await handlers[ IPC_CHANNELS.GET_SITE_STATUS ]( 'unknown' );
			expect( result ).toBe( 'halted' );
		} );
	} );

	describe( 'SCAN_SNAPSHOTS', () => {
		it( 'returns snapshots from service', async () => {
			const mockSnapshots = [ { filename: 'test.zip', name: 'test', date: 1000, size: 500 } ];
			mockService.scanSnapshots.mockResolvedValue( mockSnapshots );

			const result = await handlers[ IPC_CHANNELS.SCAN_SNAPSHOTS ]( 'site-1' );
			expect( result ).toEqual( mockSnapshots );
			expect( siteData.getSite ).toHaveBeenCalledWith( 'site-1' );
		} );

		it( 'returns empty array on error', async () => {
			mockService.scanSnapshots.mockRejectedValue( new Error( 'disk error' ) );

			const result = await handlers[ IPC_CHANNELS.SCAN_SNAPSHOTS ]( 'site-1' );
			expect( result ).toEqual( [] );
			expect( logger.warn ).toHaveBeenCalled();
		} );
	} );

	describe( 'TAKE_SNAPSHOT', () => {
		it( 'creates snapshot and logs success', async () => {
			const mockSnapshot = { filename: 'test.zip', name: 'test', date: 1000, size: 500 };
			mockService.takeSnapshot.mockResolvedValue( mockSnapshot );

			const result = await handlers[ IPC_CHANNELS.TAKE_SNAPSHOT ]( 'site-1', 'test' );
			expect( result ).toEqual( mockSnapshot );
			expect( logger.info ).toHaveBeenCalledWith( expect.stringContaining( 'Created snapshot' ) );
		} );

		it( 'logs and rethrows on error', async () => {
			mockService.takeSnapshot.mockRejectedValue( new Error( 'dump failed' ) );

			await expect( handlers[ IPC_CHANNELS.TAKE_SNAPSHOT ]( 'site-1', 'test' ) ).rejects.toThrow( 'dump failed' );
			expect( logger.warn ).toHaveBeenCalledWith( expect.stringContaining( 'Failed to take snapshot' ) );
		} );
	} );

	describe( 'RESTORE_SNAPSHOT', () => {
		it( 'restores and returns success', async () => {
			mockService.restoreSnapshot.mockResolvedValue( undefined );

			const result = await handlers[ IPC_CHANNELS.RESTORE_SNAPSHOT ]( 'site-1', 'backup.zip' );
			expect( result ).toEqual( { success: true } );
			expect( logger.info ).toHaveBeenCalledWith( expect.stringContaining( 'Restored snapshot' ) );
		} );

		it( 'propagates errors', async () => {
			mockService.restoreSnapshot.mockRejectedValue( new Error( 'import failed' ) );

			await expect(
				handlers[ IPC_CHANNELS.RESTORE_SNAPSHOT ]( 'site-1', 'backup.zip' ),
			).rejects.toThrow( 'import failed' );
		} );
	} );

	describe( 'DELETE_SNAPSHOT', () => {
		it( 'deletes and returns success', async () => {
			mockService.deleteSnapshot.mockResolvedValue( undefined );

			const result = await handlers[ IPC_CHANNELS.DELETE_SNAPSHOT ]( 'site-1', 'backup.zip' );
			expect( result ).toEqual( { success: true } );
			expect( logger.info ).toHaveBeenCalledWith( expect.stringContaining( 'Deleted snapshot' ) );
		} );

		it( 'propagates errors', async () => {
			mockService.deleteSnapshot.mockRejectedValue( new Error( 'file not found' ) );

			await expect(
				handlers[ IPC_CHANNELS.DELETE_SNAPSHOT ]( 'site-1', 'backup.zip' ),
			).rejects.toThrow( 'file not found' );
		} );
	} );
} );
