import 'jest-extended';

import {
	getWpConfigMtime,
	fetchDebugConstants,
	setDebugConstant,
	isConstantDefined,
	deleteConstant,
	readCache,
	writeCache,
} from './debug-constants.service';
import { WP_DEFAULTS, CACHE_VERSION } from '../../shared/types';
import { createMockSite, createMockWpCli, createMockSiteData } from '../../test/mockCreators';

jest.mock( 'fs' );

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require( 'fs' );

describe( 'getWpConfigMtime', () => {
	it( 'returns mtimeMs when file exists', () => {
		fs.statSync.mockReturnValue( { mtimeMs: 1700000000000 } );
		expect( getWpConfigMtime( createMockSite() ) ).toBe( 1700000000000 );
	} );

	it( 'returns 0 when file does not exist', () => {
		fs.statSync.mockImplementation( () => {
			throw new Error( 'ENOENT' );
		} );
		expect( getWpConfigMtime( createMockSite() ) ).toBe( 0 );
	} );
} );

describe( 'fetchDebugConstants', () => {
	let wpCli: ReturnType<typeof createMockWpCli>;
	let site: ReturnType<typeof createMockSite>;

	beforeEach( () => {
		wpCli = createMockWpCli();
		site = createMockSite();
	} );

	it( 'returns true for "1"', async () => {
		wpCli.run.mockResolvedValue( '1' );
		const result = await fetchDebugConstants( wpCli as any, site );
		expect( result.WP_DEBUG ).toBe( true );
		expect( result.WP_DEBUG_LOG ).toBe( true );
		expect( result.WP_DEBUG_DISPLAY ).toBe( true );
	} );

	it( 'returns true for "true" (case insensitive)', async () => {
		wpCli.run.mockResolvedValue( 'TRUE' );
		const result = await fetchDebugConstants( wpCli as any, site );
		expect( result.WP_DEBUG ).toBe( true );
	} );

	it( 'returns false for empty string', async () => {
		wpCli.run.mockResolvedValue( '' );
		const result = await fetchDebugConstants( wpCli as any, site );
		expect( result.WP_DEBUG ).toBe( false );
	} );

	it( 'returns WP_DEFAULTS fallback when WP-CLI throws', async () => {
		wpCli.run.mockRejectedValue( new Error( 'WP-CLI failed' ) );
		const result = await fetchDebugConstants( wpCli as any, site );
		expect( result.WP_DEBUG ).toBe( WP_DEFAULTS.WP_DEBUG );
		expect( result.WP_DEBUG_LOG ).toBe( WP_DEFAULTS.WP_DEBUG_LOG );
		expect( result.WP_DEBUG_DISPLAY ).toBe( WP_DEFAULTS.WP_DEBUG_DISPLAY );
	} );

	it( 'handles mixed results', async () => {
		wpCli.run
			.mockResolvedValueOnce( '1' )
			.mockRejectedValueOnce( new Error( 'not defined' ) )
			.mockResolvedValueOnce( '' );

		const result = await fetchDebugConstants( wpCli as any, site );
		expect( result.WP_DEBUG ).toBe( true );
		expect( result.WP_DEBUG_LOG ).toBe( false );
		expect( result.WP_DEBUG_DISPLAY ).toBe( false );
	} );

	it( 'trims whitespace', async () => {
		wpCli.run.mockResolvedValue( '  1  \n' );
		const result = await fetchDebugConstants( wpCli as any, site );
		expect( result.WP_DEBUG ).toBe( true );
	} );
} );

describe( 'setDebugConstant', () => {
	it( 'passes "true"/"false" with --raw --add', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();
		wpCli.run.mockResolvedValue( undefined );

		await setDebugConstant( wpCli as any, site, 'WP_DEBUG', true );
		expect( wpCli.run ).toHaveBeenCalledWith(
			site,
			[ 'config', 'set', 'WP_DEBUG', 'true', '--raw', '--add', `--path=${ site.path }` ],
		);

		await setDebugConstant( wpCli as any, site, 'WP_DEBUG', false );
		expect( wpCli.run ).toHaveBeenCalledWith(
			site,
			[ 'config', 'set', 'WP_DEBUG', 'false', '--raw', '--add', `--path=${ site.path }` ],
		);
	} );
} );

describe( 'isConstantDefined', () => {
	it( 'returns true when wpCli succeeds, false when it throws', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();

		wpCli.run.mockResolvedValue( '1' );
		expect( await isConstantDefined( wpCli as any, site, 'WP_DEBUG' ) ).toBe( true );

		wpCli.run.mockRejectedValue( new Error( 'not defined' ) );
		expect( await isConstantDefined( wpCli as any, site, 'WP_DEBUG' ) ).toBe( false );
	} );
} );

describe( 'deleteConstant', () => {
	it( 'calls config delete', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();
		wpCli.run.mockResolvedValue( undefined );

		await deleteConstant( wpCli as any, site, 'WP_DEBUG_DISPLAY' );
		expect( wpCli.run ).toHaveBeenCalledWith(
			site,
			[ 'config', 'delete', 'WP_DEBUG_DISPLAY', `--path=${ site.path }` ],
		);
	} );
} );

describe( 'readCache', () => {
	it( 'returns superchargedAddon data when present', () => {
		const cacheData = {
			debugConstants: { WP_DEBUG: true, WP_DEBUG_LOG: false, WP_DEBUG_DISPLAY: true },
			cachedAt: 1700000000000,
			cacheVersion: CACHE_VERSION,
		};
		expect( readCache( createMockSite( { superchargedAddon: cacheData } ) ) ).toEqual( cacheData );
	} );

	it( 'returns undefined when no cache', () => {
		expect( readCache( createMockSite() ) ).toBeUndefined();
	} );
} );

describe( 'writeCache', () => {
	it( 'persists with correct shape and timestamp', () => {
		const siteData = createMockSiteData();
		const cache = { WP_DEBUG: true, WP_DEBUG_LOG: false, WP_DEBUG_DISPLAY: true } as any;

		const dateBefore = Date.now();
		writeCache( siteData as any, 'abc123', cache );
		const dateAfter = Date.now();

		const callArgs = siteData.updateSite.mock.calls[ 0 ];
		expect( callArgs[ 0 ] ).toBe( 'abc123' );
		expect( callArgs[ 1 ].superchargedAddon.debugConstants ).toEqual( cache );
		expect( callArgs[ 1 ].superchargedAddon.cacheVersion ).toBe( CACHE_VERSION );
		expect( callArgs[ 1 ].superchargedAddon.cachedAt ).toBeGreaterThanOrEqual( dateBefore );
		expect( callArgs[ 1 ].superchargedAddon.cachedAt ).toBeLessThanOrEqual( dateAfter );
	} );
} );
