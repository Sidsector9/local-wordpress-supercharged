import 'jest-extended';
import * as fs from 'fs-extra';
import { createMockSite, createMockWpCli } from '../../test/mockCreators';
import { slugify } from '../../shared/types';
import {
	getSqlDir,
	scanSnapshots,
	takeSnapshot,
	restoreSnapshot,
	deleteSnapshot,
} from './snapshots.service';

jest.mock( 'fs-extra' );
jest.mock( 'adm-zip', () => {
	const addLocalFile = jest.fn();
	const writeZip = jest.fn();
	const extractAllTo = jest.fn();
	return jest.fn().mockImplementation( () => ( {
		addLocalFile,
		writeZip,
		extractAllTo,
	} ) );
} );

const mockFs = fs as jest.Mocked<typeof fs>;

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

describe( 'slugify', () => {
	it( 'converts to lowercase and replaces spaces with hyphens', () => {
		expect( slugify( 'My Snapshot' ) ).toBe( 'my-snapshot' );
	} );

	it( 'removes special characters', () => {
		expect( slugify( 'Hello World!' ) ).toBe( 'hello-world' );
	} );

	it( 'collapses multiple hyphens', () => {
		expect( slugify( 'a---b' ) ).toBe( 'a-b' );
	} );

	it( 'trims leading and trailing hyphens', () => {
		expect( slugify( '--hello--' ) ).toBe( 'hello' );
	} );

	it( 'returns empty string for non-alphanumeric input', () => {
		expect( slugify( '!!!' ) ).toBe( '' );
	} );
} );

describe( 'getSqlDir', () => {
	it( 'returns app/sql path under site root', () => {
		const site = createMockSite( { path: '/Users/Local Sites/test-site' } );
		const dir = getSqlDir( site );
		expect( dir ).toContain( 'app' );
		expect( dir ).toContain( 'sql' );
	} );
} );

describe( 'scanSnapshots', () => {
	let site: ReturnType<typeof createMockSite>;

	beforeEach( () => {
		jest.clearAllMocks();
		site = createMockSite();
		mockFs.ensureDir.mockResolvedValue( undefined );
	} );

	it( 'returns empty array when no zip files exist', async () => {
		mockFs.readdir.mockResolvedValue( [] as any );
		const result = await scanSnapshots( site );
		expect( result ).toEqual( [] );
	} );

	it( 'filters only .zip files', async () => {
		mockFs.readdir.mockResolvedValue( [ 'snap.zip', 'data.sql', 'readme.txt' ] as any );
		mockFs.stat.mockResolvedValue( { mtimeMs: 1000, size: 500 } as any );

		const result = await scanSnapshots( site );
		expect( result ).toHaveLength( 1 );
		expect( result[ 0 ].filename ).toBe( 'snap.zip' );
		expect( result[ 0 ].name ).toBe( 'snap' );
	} );

	it( 'sorts snapshots by date descending', async () => {
		mockFs.readdir.mockResolvedValue( [ 'old.zip', 'new.zip' ] as any );
		mockFs.stat
			.mockResolvedValueOnce( { mtimeMs: 1000, size: 100 } as any )
			.mockResolvedValueOnce( { mtimeMs: 2000, size: 200 } as any );

		const result = await scanSnapshots( site );
		expect( result[ 0 ].name ).toBe( 'new' );
		expect( result[ 1 ].name ).toBe( 'old' );
	} );

	it( 'ensures sql directory exists', async () => {
		mockFs.readdir.mockResolvedValue( [] as any );
		await scanSnapshots( site );
		expect( mockFs.ensureDir ).toHaveBeenCalled();
	} );
} );

describe( 'takeSnapshot', () => {
	let site: ReturnType<typeof createMockSite>;
	let wpCli: ReturnType<typeof createMockWpCli>;
	let siteDatabase: ReturnType<typeof createMockSiteDatabase>;

	beforeEach( () => {
		jest.clearAllMocks();
		site = createMockSite();
		wpCli = createMockWpCli();
		siteDatabase = createMockSiteDatabase();
		mockFs.ensureDir.mockResolvedValue( undefined );
		mockFs.pathExists.mockResolvedValue( false as any );
		mockFs.remove.mockResolvedValue( undefined );
		mockFs.stat.mockResolvedValue( { mtimeMs: Date.now(), size: 1024 } as any );
	} );

	it( 'throws if slugified name is empty', async () => {
		await expect( takeSnapshot( siteDatabase as any, wpCli as any, site, '!!!' ) ).rejects.toThrow(
			'Snapshot name is invalid.',
		);
	} );

	it( 'throws if snapshot already exists', async () => {
		mockFs.pathExists.mockResolvedValue( true as any );
		await expect( takeSnapshot( siteDatabase as any, wpCli as any, site, 'existing' ) ).rejects.toThrow(
			'Snapshot name already exists.',
		);
	} );

	it( 'clears transients, dumps database, creates zip, and removes sql', async () => {
		const result = await takeSnapshot( siteDatabase as any, wpCli as any, site, 'My Backup' );

		expect( wpCli.run ).toHaveBeenCalledWith( site, [ 'transient', 'delete', '--all' ] );
		expect( siteDatabase.dump ).toHaveBeenCalled();
		expect( mockFs.remove ).toHaveBeenCalled();
		expect( result.filename ).toBe( 'my-backup.zip' );
		expect( result.name ).toBe( 'my-backup' );
	} );

	it( 'continues if transient delete fails', async () => {
		wpCli.run.mockRejectedValue( new Error( 'DB not ready' ) );

		const result = await takeSnapshot( siteDatabase as any, wpCli as any, site, 'test' );
		expect( siteDatabase.dump ).toHaveBeenCalled();
		expect( result.filename ).toBe( 'test.zip' );
	} );
} );

describe( 'restoreSnapshot', () => {
	let site: ReturnType<typeof createMockSite>;
	let siteDatabase: ReturnType<typeof createMockSiteDatabase>;

	beforeEach( () => {
		jest.clearAllMocks();
		site = createMockSite();
		( site as any ).mysql = { database: 'local', user: 'root', password: 'root' };
		siteDatabase = createMockSiteDatabase();
		mockFs.remove.mockResolvedValue( undefined );
	} );

	it( 'throws if zip file does not exist', async () => {
		mockFs.pathExists.mockResolvedValue( false as any );
		await expect( restoreSnapshot( siteDatabase as any, site, 'missing.zip' ) ).rejects.toThrow(
			'Snapshot file not found.',
		);
	} );

	it( 'extracts zip, imports sql, and cleans up', async () => {
		mockFs.pathExists
			.mockResolvedValueOnce( true as any ) // zip exists
			.mockResolvedValueOnce( true as any ); // extracted sql exists

		await restoreSnapshot( siteDatabase as any, site, 'backup.zip' );

		expect( siteDatabase.exec ).toHaveBeenCalledWith(
			site,
			[ 'local', '-e', expect.stringContaining( 'source' ) ],
		);
		expect( mockFs.remove ).toHaveBeenCalled();
	} );

	it( 'cleans up sql file even if import fails', async () => {
		mockFs.pathExists
			.mockResolvedValueOnce( true as any )
			.mockResolvedValueOnce( true as any );
		siteDatabase.exec.mockRejectedValue( new Error( 'import failed' ) );

		await expect( restoreSnapshot( siteDatabase as any, site, 'backup.zip' ) ).rejects.toThrow( 'import failed' );
		expect( mockFs.remove ).toHaveBeenCalled();
	} );

	it( 'throws if extracted sql file is not found', async () => {
		mockFs.pathExists
			.mockResolvedValueOnce( true as any ) // zip exists
			.mockResolvedValueOnce( false as any ); // sql not found after extract

		await expect( restoreSnapshot( siteDatabase as any, site, 'backup.zip' ) ).rejects.toThrow(
			'Failed to extract snapshot SQL file.',
		);
	} );

	it( 'uses site.mysql.database for the database name', async () => {
		( site as any ).mysql = { database: 'my_db', user: 'root', password: 'root' };
		mockFs.pathExists.mockResolvedValue( true as any );

		await restoreSnapshot( siteDatabase as any, site, 'backup.zip' );

		expect( siteDatabase.exec ).toHaveBeenCalledWith(
			site,
			[ 'my_db', '-e', expect.stringContaining( 'source' ) ],
		);
	} );
} );

describe( 'deleteSnapshot', () => {
	let site: ReturnType<typeof createMockSite>;

	beforeEach( () => {
		jest.clearAllMocks();
		site = createMockSite();
		mockFs.remove.mockResolvedValue( undefined );
	} );

	it( 'throws if zip file does not exist', async () => {
		mockFs.pathExists.mockResolvedValue( false as any );
		await expect( deleteSnapshot( site, 'missing.zip' ) ).rejects.toThrow( 'Snapshot file not found.' );
	} );

	it( 'removes the zip file', async () => {
		mockFs.pathExists.mockResolvedValue( true as any );
		await deleteSnapshot( site, 'backup.zip' );
		expect( mockFs.remove ).toHaveBeenCalledWith( expect.stringContaining( 'backup.zip' ) );
	} );
} );
