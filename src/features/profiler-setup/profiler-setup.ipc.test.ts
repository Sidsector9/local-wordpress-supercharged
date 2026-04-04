import 'jest-extended';

import * as LocalMain from '@getflywheel/local/main';
import { registerProfilerSetupIpc, ProfilerSetupIpcDeps } from './profiler-setup.ipc';
import { IPC_CHANNELS } from '../../shared/types';
import {
	createMockSite,
	createMockSiteData,
	createMockLogger,
	createMockLightningServices,
	createMockSiteProcessManager,
} from '../../test/mockCreators';
import * as service from './profiler-setup.service';

jest.mock( './profiler-setup.service' );

const mockService = service as jest.Mocked<typeof service>;

describe( 'registerProfilerSetupIpc', () => {
	let siteData: ReturnType<typeof createMockSiteData>;
	let lightningServices: ReturnType<typeof createMockLightningServices>;
	let siteProcessManager: ReturnType<typeof createMockSiteProcessManager>;
	let logger: ReturnType<typeof createMockLogger>;
	let deps: ProfilerSetupIpcDeps;
	let handlers: Record<string, Function>;

	beforeEach( () => {
		jest.clearAllMocks();

		siteData = createMockSiteData();
		lightningServices = createMockLightningServices();
		siteProcessManager = createMockSiteProcessManager();
		logger = createMockLogger();
		deps = {
			siteData: siteData as any,
			lightningServices: lightningServices as any,
			siteProcessManager: siteProcessManager as any,
			logger,
		};

		handlers = {};
		( LocalMain.addIpcAsyncListener as jest.Mock ).mockImplementation(
			( channel: string, handler: Function ) => {
				handlers[ channel ] = handler;
			},
		);

		registerProfilerSetupIpc( deps );
	} );

	describe( 'GET_PROFILER_STATUS', () => {
		it( 'returns status from getProfilerStatus', async () => {
			const site = createMockSite( { id: 's1' } );
			siteData.getSite.mockReturnValue( site );

			const expectedStatus = {
				xhprof: { status: 'ready' as const, version: '2.3.10' },
				k6: { status: 'ready' as const, version: 'v0.54.0' },
				muPlugin: { status: 'ready' as const, version: 'installed' },
			};
			mockService.getProfilerStatus.mockResolvedValue( expectedStatus );

			const result = await handlers[ IPC_CHANNELS.GET_PROFILER_STATUS ]( 's1' );

			expect( lightningServices.getSiteServiceByRole ).toHaveBeenCalledWith(
				site,
				'php',
			);
			expect( result ).toEqual( expectedStatus );
		} );

		it( 'returns error for xhprof when PHP service is not found', async () => {
			siteData.getSite.mockReturnValue( createMockSite( { id: 's1' } ) );
			lightningServices.getSiteServiceByRole.mockReturnValue( null );
			mockService.checkK6Installed.mockResolvedValue( { status: 'missing' } );

			const result = await handlers[ IPC_CHANNELS.GET_PROFILER_STATUS ]( 's1' );

			expect( result.xhprof.status ).toBe( 'error' );
			expect( result.xhprof.error ).toContain( 'PHP service not found' );
		} );
	} );

	// -----------------------------------------------------------------------
	// RUN_PROFILER_SETUP
	// -----------------------------------------------------------------------

	describe( 'RUN_PROFILER_SETUP', () => {
		beforeEach( () => {
			siteData.getSite.mockReturnValue( createMockSite( { id: 's1' } ) );
			mockService.checkXhprofCached.mockReturnValue( false );
			mockService.ensureXhprofSource.mockResolvedValue( undefined );
			mockService.compileXhprof.mockResolvedValue( undefined );
			mockService.installXhprofExtension.mockResolvedValue( undefined );
			mockService.findExtensionDir.mockResolvedValue( '/ext/no-debug-non-zts-123' );
			mockService.verifyXhprofInstalled.mockResolvedValue( { status: 'ready', version: 'installed' } );
			mockService.checkK6Installed.mockResolvedValue( { status: 'missing' } );
			mockService.downloadAndInstallK6.mockResolvedValue( undefined );
			mockService.deployMuPlugin.mockResolvedValue( undefined );
			mockService.writeProfilerCache.mockImplementation( () => {} );
		} );

		it( 'runs the full xhprof setup sequence when not cached', async () => {
			// After k6 download, return ready
			mockService.checkK6Installed
				.mockResolvedValueOnce( { status: 'missing' } )
				.mockResolvedValueOnce( { status: 'ready', version: 'v0.54.0' } );

			const result = await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( mockService.ensureXhprofSource ).toHaveBeenCalled();
			expect( mockService.compileXhprof ).toHaveBeenCalled();
			expect( mockService.installXhprofExtension ).toHaveBeenCalled();
			expect( siteProcessManager.restartSiteService ).toHaveBeenCalled();
			expect( mockService.verifyXhprofInstalled ).toHaveBeenCalled();
			expect( result.xhprof.status ).toBe( 'ready' );
		} );

		it( 'skips compilation when xhprof is already cached', async () => {
			mockService.checkXhprofCached.mockReturnValue( true );
			mockService.checkK6Installed.mockResolvedValue( { status: 'ready', version: 'v0.54.0' } );

			await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( mockService.ensureXhprofSource ).not.toHaveBeenCalled();
			expect( mockService.compileXhprof ).not.toHaveBeenCalled();
			// ini + restart should still happen
			expect( mockService.installXhprofExtension ).toHaveBeenCalled();
			expect( siteProcessManager.restartSiteService ).toHaveBeenCalled();
		} );

		it( 'skips k6 download when already installed', async () => {
			mockService.checkK6Installed.mockResolvedValue( { status: 'ready', version: 'v0.54.0' } );

			await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( mockService.downloadAndInstallK6 ).not.toHaveBeenCalled();
		} );

		it( 'handles xhprof failure independently from k6', async () => {
			mockService.ensureXhprofSource.mockRejectedValue( new Error( 'git clone failed' ) );
			mockService.checkK6Installed
				.mockResolvedValueOnce( { status: 'missing' } )
				.mockResolvedValueOnce( { status: 'ready', version: 'v0.54.0' } );

			const result = await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( result.xhprof.status ).toBe( 'error' );
			expect( result.xhprof.error ).toContain( 'git clone failed' );
			expect( result.k6.status ).toBe( 'ready' );
		} );

		it( 'handles k6 failure independently from xhprof', async () => {
			mockService.checkK6Installed.mockResolvedValue( { status: 'missing' } );
			mockService.downloadAndInstallK6.mockRejectedValue( new Error( 'download failed' ) );

			const result = await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( result.xhprof.status ).toBe( 'ready' );
			expect( result.k6.status ).toBe( 'error' );
			expect( result.k6.error ).toContain( 'download failed' );
		} );

		it( 'sends log events via sendIPCEvent', async () => {
			mockService.checkK6Installed.mockResolvedValue( { status: 'ready', version: 'v0.54.0' } );

			await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( LocalMain.sendIPCEvent ).toHaveBeenCalledWith(
				IPC_CHANNELS.PROFILER_SETUP_LOG,
				's1',
				expect.any( String ),
			);
		} );

		it( 'sends PROFILER_SETUP_COMPLETED event with final status', async () => {
			mockService.checkK6Installed
				.mockResolvedValueOnce( { status: 'missing' } )
				.mockResolvedValueOnce( { status: 'ready', version: 'v0.54.0' } );

			const result = await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( LocalMain.sendIPCEvent ).toHaveBeenCalledWith(
				IPC_CHANNELS.PROFILER_SETUP_COMPLETED,
				's1',
				result,
			);
		} );

		it( 'writes profiler cache with setupCompleted=true when all tools ready', async () => {
			mockService.checkK6Installed
				.mockResolvedValueOnce( { status: 'missing' } )
				.mockResolvedValueOnce( { status: 'ready', version: 'v0.54.0' } );

			await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( mockService.writeProfilerCache ).toHaveBeenCalledWith(
				siteData,
				's1',
				expect.objectContaining( { setupCompleted: true } ),
			);
		} );

		it( 'writes profiler cache with setupCompleted=false when a tool fails', async () => {
			mockService.ensureXhprofSource.mockRejectedValue( new Error( 'fail' ) );
			mockService.checkK6Installed.mockResolvedValue( { status: 'ready', version: 'v0.54.0' } );

			await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( mockService.writeProfilerCache ).toHaveBeenCalledWith(
				siteData,
				's1',
				expect.objectContaining( { setupCompleted: false } ),
			);
		} );

		it( 'reports error when PHP service is not found', async () => {
			lightningServices.getSiteServiceByRole.mockReturnValue( null );
			mockService.checkK6Installed.mockResolvedValue( { status: 'ready', version: 'v0.54.0' } );

			const result = await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			expect( result.xhprof.status ).toBe( 'error' );
			expect( result.xhprof.error ).toContain( 'PHP service not found' );
		} );

		it( 'restarts PHP service after installing extension', async () => {
			mockService.checkK6Installed.mockResolvedValue( { status: 'ready', version: 'v0.54.0' } );

			await handlers[ IPC_CHANNELS.RUN_PROFILER_SETUP ]( 's1' );

			// Verify restart is called after installXhprofExtension
			const installCallOrder = mockService.installXhprofExtension.mock.invocationCallOrder[ 0 ];
			const restartCallOrder = siteProcessManager.restartSiteService.mock.invocationCallOrder[ 0 ];
			expect( restartCallOrder ).toBeGreaterThan( installCallOrder );
		} );
	} );
} );
