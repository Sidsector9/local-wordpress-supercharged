/**
 * vuln-scan.service.test.ts -- Unit tests for vulnerability scan service functions.
 */

import {
	parsePackageInput,
	parsePackageLockJson,
	parseYarnLock,
	parsePnpmLockYaml,
} from './vuln-scan.service';

// ---------------------------------------------------------------------------
// parsePackageInput
// ---------------------------------------------------------------------------

describe( 'parsePackageInput', () => {
	it( 'parses a single package@version', () => {
		const result = parsePackageInput( 'axios@1.14.1' );
		expect( result ).toEqual( [ { name: 'axios', version: '1.14.1' } ] );
	} );

	it( 'parses multiple newline-separated entries', () => {
		const result = parsePackageInput( 'axios@1.14.1\nlodash@4.17.20' );
		expect( result ).toEqual( [
			{ name: 'axios', version: '1.14.1' },
			{ name: 'lodash', version: '4.17.20' },
		] );
	} );

	it( 'handles scoped packages', () => {
		const result = parsePackageInput( '@babel/core@7.20.0' );
		expect( result ).toEqual( [ { name: '@babel/core', version: '7.20.0' } ] );
	} );

	it( 'lowercases package names', () => {
		const result = parsePackageInput( 'Axios@1.0.0' );
		expect( result ).toEqual( [ { name: 'axios', version: '1.0.0' } ] );
	} );

	it( 'trims whitespace per line', () => {
		const result = parsePackageInput( '  axios@1.0.0 \n lodash@4.0.0  ' );
		expect( result ).toHaveLength( 2 );
		expect( result[ 0 ].name ).toBe( 'axios' );
		expect( result[ 1 ].name ).toBe( 'lodash' );
	} );

	it( 'ignores empty lines', () => {
		const result = parsePackageInput( 'axios@1.0.0\n\nlodash@4.0.0\n' );
		expect( result ).toHaveLength( 2 );
	} );

	it( 'handles Windows-style line endings', () => {
		const result = parsePackageInput( 'axios@1.0.0\r\nlodash@4.0.0' );
		expect( result ).toHaveLength( 2 );
	} );

	it( 'throws on missing version', () => {
		expect( () => parsePackageInput( 'axios' ) ).toThrow( 'Invalid format' );
	} );

	it( 'throws on trailing @', () => {
		expect( () => parsePackageInput( 'axios@' ) ).toThrow( 'Invalid format' );
	} );

	it( 'handles prerelease versions', () => {
		const result = parsePackageInput( 'react@18.0.0-rc.0' );
		expect( result ).toEqual( [ { name: 'react', version: '18.0.0-rc.0' } ] );
	} );
} );

// ---------------------------------------------------------------------------
// parsePackageLockJson
// ---------------------------------------------------------------------------

describe( 'parsePackageLockJson', () => {
	it( 'parses v2/v3 format with packages key', () => {
		const lockContent = JSON.stringify( {
			name: 'my-project',
			lockfileVersion: 3,
			packages: {
				'': { name: 'my-project', version: '1.0.0' },
				'node_modules/axios': { version: '1.14.1' },
				'node_modules/lodash': { version: '4.17.21' },
				'node_modules/axios/node_modules/follow-redirects': { version: '1.15.0' },
			},
		} );

		const deps = parsePackageLockJson( lockContent );

		expect( deps ).toContainEqual( { name: 'axios', version: '1.14.1', isDirect: true } );
		expect( deps ).toContainEqual( { name: 'lodash', version: '4.17.21', isDirect: true } );
		expect( deps ).toContainEqual( { name: 'follow-redirects', version: '1.15.0', isDirect: false } );
	} );

	it( 'parses scoped packages in v2/v3 format', () => {
		const lockContent = JSON.stringify( {
			lockfileVersion: 3,
			packages: {
				'': {},
				'node_modules/@babel/core': { version: '7.20.0' },
			},
		} );

		const deps = parsePackageLockJson( lockContent );
		expect( deps ).toContainEqual( { name: '@babel/core', version: '7.20.0', isDirect: true } );
	} );

	it( 'parses v1 format with nested dependencies', () => {
		const lockContent = JSON.stringify( {
			lockfileVersion: 1,
			dependencies: {
				axios: {
					version: '0.21.1',
					dependencies: {
						'follow-redirects': { version: '1.13.3' },
					},
				},
				lodash: { version: '4.17.20' },
			},
		} );

		const deps = parsePackageLockJson( lockContent );

		expect( deps ).toContainEqual( { name: 'axios', version: '0.21.1', isDirect: true } );
		expect( deps ).toContainEqual( { name: 'follow-redirects', version: '1.13.3', isDirect: false } );
		expect( deps ).toContainEqual( { name: 'lodash', version: '4.17.20', isDirect: true } );
	} );

	it( 'skips entries without versions', () => {
		const lockContent = JSON.stringify( {
			lockfileVersion: 3,
			packages: {
				'': {},
				'node_modules/no-version': {},
				'node_modules/has-version': { version: '1.0.0' },
			},
		} );

		const deps = parsePackageLockJson( lockContent );
		expect( deps ).toHaveLength( 1 );
		expect( deps[ 0 ].name ).toBe( 'has-version' );
	} );
} );

// ---------------------------------------------------------------------------
// parseYarnLock
// ---------------------------------------------------------------------------

describe( 'parseYarnLock', () => {
	it( 'parses standard entries', () => {
		const content = `# yarn lockfile v1

axios@^1.0.0:
  version "1.14.1"
  resolved "https://registry.yarnpkg.com/axios/-/axios-1.14.1.tgz"
  integrity sha512-abc

lodash@^4.0.0:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"
`;

		const deps = parseYarnLock( content );
		expect( deps ).toContainEqual( { name: 'axios', version: '1.14.1', isDirect: false } );
		expect( deps ).toContainEqual( { name: 'lodash', version: '4.17.21', isDirect: false } );
	} );

	it( 'parses scoped packages', () => {
		const content = `"@babel/core@^7.0.0":
  version "7.20.0"
  resolved "https://registry.yarnpkg.com/@babel/core/-/core-7.20.0.tgz"
`;

		const deps = parseYarnLock( content );
		expect( deps ).toContainEqual( { name: '@babel/core', version: '7.20.0', isDirect: false } );
	} );

	it( 'handles multiple version ranges for same package', () => {
		const content = `"axios@^0.21.0", "axios@~0.21.1":
  version "0.21.1"
  resolved "https://registry.yarnpkg.com/axios/-/axios-0.21.1.tgz"
`;

		const deps = parseYarnLock( content );
		expect( deps ).toContainEqual( { name: 'axios', version: '0.21.1', isDirect: false } );
	} );

	it( 'skips comment blocks', () => {
		const content = `# yarn lockfile v1
# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT.

axios@^1.0.0:
  version "1.0.0"
`;

		const deps = parseYarnLock( content );
		expect( deps ).toHaveLength( 1 );
		expect( deps[ 0 ].name ).toBe( 'axios' );
	} );
} );

// ---------------------------------------------------------------------------
// parsePnpmLockYaml
// ---------------------------------------------------------------------------

describe( 'parsePnpmLockYaml', () => {
	it( 'parses v9 format (name@version)', () => {
		const content = `lockfileVersion: '9.0'

packages:

  axios@1.14.1:
    resolution: {integrity: sha512-abc}

  lodash@4.17.21:
    resolution: {integrity: sha512-xyz}
`;

		const deps = parsePnpmLockYaml( content );
		expect( deps ).toContainEqual( { name: 'axios', version: '1.14.1', isDirect: false } );
		expect( deps ).toContainEqual( { name: 'lodash', version: '4.17.21', isDirect: false } );
	} );

	it( 'parses v6 format (/name/version)', () => {
		const content = `lockfileVersion: 5.4

packages:

  /axios/1.14.1:
    resolution: {integrity: sha512-abc}

  /lodash/4.17.21:
    resolution: {integrity: sha512-xyz}
`;

		const deps = parsePnpmLockYaml( content );
		expect( deps ).toContainEqual( { name: 'axios', version: '1.14.1', isDirect: false } );
		expect( deps ).toContainEqual( { name: 'lodash', version: '4.17.21', isDirect: false } );
	} );

	it( 'parses scoped packages in v9 format', () => {
		const content = `lockfileVersion: '9.0'

packages:

  '@babel/core@7.20.0':
    resolution: {integrity: sha512-abc}
`;

		const deps = parsePnpmLockYaml( content );
		expect( deps ).toContainEqual( { name: '@babel/core', version: '7.20.0', isDirect: false } );
	} );

	it( 'parses scoped packages in v6 format', () => {
		const content = `lockfileVersion: 5.4

packages:

  /@babel/core/7.20.0:
    resolution: {integrity: sha512-abc}
`;

		const deps = parsePnpmLockYaml( content );
		expect( deps ).toContainEqual( { name: '@babel/core', version: '7.20.0', isDirect: false } );
	} );

	it( 'stops parsing at next top-level key after packages', () => {
		const content = `lockfileVersion: '9.0'

packages:

  axios@1.14.1:
    resolution: {integrity: sha512-abc}

snapshots:

  somethingelse@1.0.0:
    dev: true
`;

		const deps = parsePnpmLockYaml( content );
		expect( deps ).toHaveLength( 1 );
		expect( deps[ 0 ].name ).toBe( 'axios' );
	} );

	it( 'returns empty array when no packages section', () => {
		const content = `lockfileVersion: '9.0'

importers:
  .:
    dependencies: {}
`;

		const deps = parsePnpmLockYaml( content );
		expect( deps ).toHaveLength( 0 );
	} );
} );
