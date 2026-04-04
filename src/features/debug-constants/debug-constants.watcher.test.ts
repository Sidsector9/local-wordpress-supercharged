import 'jest-extended';

import { createWatcherManager, WatcherDeps } from './debug-constants.watcher';
import { createMockSite, createMockWpCli, createMockSiteData, createMockLogger } from '../../test/mockCreators';
import * as LocalMain from '@getflywheel/local/main';

jest.mock( 'fs' );

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require( 'fs' );

describe( 'createWatcherManager', () => {
	let wpCli: ReturnType<typeof createMockWpCli>;
	let siteData: ReturnType<typeof createMockSiteData>;
	let logger: ReturnType<typeof createMockLogger>;
	let deps: WatcherDeps;
	let mockWatcherClose: jest.Mock;
	let watchCallback: ( eventType: string ) => void;

	beforeEach( () => {
		jest.clearAllMocks();
		jest.useFakeTimers( { doNotFake: [ 'setImmediate', 'nextTick' ] } );

		wpCli = createMockWpCli();
		siteData = createMockSiteData( createMockSite() );
		logger = createMockLogger();
		deps = { wpCli: wpCli as any, siteData: siteData as any, logger };

		mockWatcherClose = jest.fn();
		fs.watch.mockImplementation( ( _filePath: string, cb: Function ) => {
			watchCallback = cb as any;
			return { close: mockWatcherClose };
		} );
	} );

	afterEach( () => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	} );

	describe( 'watchSite', () => {
		it( 'creates an fs.watch on wp-config.php', () => {
			createWatcherManager( deps ).watchSite( 's1' );
			expect( fs.watch ).toHaveBeenCalledTimes( 1 );
			expect( fs.watch.mock.calls[ 0 ][ 0 ] ).toContain( 'wp-config.php' );
		} );

		it( 'does not duplicate watchers for the same site', () => {
			const manager = createWatcherManager( deps );
			manager.watchSite( 's1' );
			manager.watchSite( 's1' );
			expect( fs.watch ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'creates separate watchers for different sites', () => {
			const manager = createWatcherManager( deps );
			manager.watchSite( 's1' );
			manager.watchSite( 's2' );
			expect( fs.watch ).toHaveBeenCalledTimes( 2 );
		} );

		it( 'logs a warning if fs.watch throws', () => {
			fs.watch.mockImplementation( () => {
				throw new Error( 'ENOENT' );
			} );
			createWatcherManager( deps ).watchSite( 's1' );
			expect( logger.warn ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'ignores non-"change" events', async () => {
			createWatcherManager( deps ).watchSite( 's1' );
			watchCallback( 'rename' );
			await Promise.resolve();
			expect( wpCli.run ).not.toHaveBeenCalled();
		} );

		it( 're-fetches on "change" event', async () => {
			wpCli.run.mockResolvedValue( '1' );
			createWatcherManager( deps ).watchSite( 's1' );
			watchCallback( 'change' );
			await new Promise( ( r ) => setImmediate( r ) );
			expect( wpCli.run ).toHaveBeenCalledTimes( 4 );
		} );

		it( 'suppresses re-fetch when selfWriting', async () => {
			const manager = createWatcherManager( deps );
			manager.watchSite( 's1' );
			manager.markSelfWriting( 's1' );
			watchCallback( 'change' );
			await new Promise( ( r ) => setImmediate( r ) );
			expect( wpCli.run ).not.toHaveBeenCalled();
		} );

		it( 'sends IPC event with siteId and refreshed constants on external change', async () => {
			wpCli.run.mockResolvedValue( '1' );
			createWatcherManager( deps ).watchSite( 'test-site-id' );
			watchCallback( 'change' );
			await new Promise( ( r ) => setImmediate( r ) );
			expect( LocalMain.sendIPCEvent ).toHaveBeenCalledWith(
				'supercharged:debug-constants-changed',
				'test-site-id',
				expect.objectContaining( { WP_DEBUG: true } ),
			);
		} );
	} );

	describe( 'unwatchSite', () => {
		it( 'closes the watcher', () => {
			const manager = createWatcherManager( deps );
			manager.watchSite( 's1' );
			manager.unwatchSite( 's1' );
			expect( mockWatcherClose ).toHaveBeenCalledTimes( 1 );
		} );

		it( 'is a no-op for unwatched sites', () => {
			createWatcherManager( deps ).unwatchSite( 'nonexistent' );
			expect( mockWatcherClose ).not.toHaveBeenCalled();
		} );
	} );

	describe( 'clearSelfWriting', () => {
		it( 'clears after the default 500ms delay', async () => {
			wpCli.run.mockResolvedValue( '1' );
			const manager = createWatcherManager( deps );
			manager.watchSite( 's1' );
			manager.markSelfWriting( 's1' );

			watchCallback( 'change' );
			await new Promise( ( r ) => setImmediate( r ) );
			expect( wpCli.run ).not.toHaveBeenCalled();

			manager.clearSelfWriting( 's1' );
			jest.advanceTimersByTime( 500 );

			watchCallback( 'change' );
			await new Promise( ( r ) => setImmediate( r ) );
			expect( wpCli.run ).toHaveBeenCalled();
		} );

		it( 'does not clear before delay elapses', async () => {
			wpCli.run.mockResolvedValue( '1' );
			const manager = createWatcherManager( deps );
			manager.watchSite( 's1' );
			manager.markSelfWriting( 's1' );
			manager.clearSelfWriting( 's1' );

			jest.advanceTimersByTime( 400 );
			watchCallback( 'change' );
			await new Promise( ( r ) => setImmediate( r ) );
			expect( wpCli.run ).not.toHaveBeenCalled();
		} );
	} );
} );
