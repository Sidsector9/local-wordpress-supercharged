/**
 * vuln-scan.service.ts -- Pure functions for detecting vulnerable npm packages
 * across Local sites, global installations, and package manager caches.
 *
 * All functions are stateless and take their dependencies as arguments.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { execFile } from 'child_process';
import { VulnPackageQuery, VulnScanMatch, VulnScanOptions, VulnScanResult } from '../../shared/types';

// ---------------------------------------------------------------------------
// Shell helpers (same pattern as profiler-setup.service.ts)
// ---------------------------------------------------------------------------

interface ExecOpts {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout?: number;
}

function execFileAsync(
	command: string,
	args: string[],
	opts: ExecOpts = {},
): Promise<string> {
	return new Promise( ( resolve, reject ) => {
		execFile( command, args, {
			cwd: opts.cwd,
			env: opts.env,
			timeout: opts.timeout ?? 30_000,
			maxBuffer: 10 * 1024 * 1024,
		}, ( error, stdout, stderr ) => {
			if ( error ) {
				const msg = stderr?.trim() || error.message;
				reject( new Error( msg ) );
			} else {
				resolve( stdout.trim() );
			}
		} );
	} );
}

function execInShell(
	command: string,
	opts: ExecOpts = {},
): Promise<string> {
	if ( process.platform === 'win32' ) {
		const comspec = process.env.ComSpec || 'cmd.exe';
		return execFileAsync( comspec, [ '/c', command ], opts );
	}

	const shell = process.env.SHELL || '/bin/sh';
	return execFileAsync( shell, [ '-l', '-c', command ], opts );
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/**
 * Parses newline-separated "package@version" input into structured queries.
 * Handles scoped packages like @scope/name@version.
 * @param raw
 */
export function parsePackageInput( raw: string ): VulnPackageQuery[] {
	const entries = raw.split( /\r?\n/ ).map( ( s ) => s.trim() ).filter( Boolean );
	const results: VulnPackageQuery[] = [];

	for ( const entry of entries ) {
		let atIdx: number;
		if ( entry.startsWith( '@' ) ) {
			// Scoped package: find the second '@'
			atIdx = entry.indexOf( '@', 1 );
		} else {
			atIdx = entry.indexOf( '@' );
		}

		if ( atIdx <= 0 || atIdx === entry.length - 1 ) {
			throw new Error( `Invalid format: "${ entry }". Expected name@version (e.g. axios@1.14.1)` );
		}

		const name = entry.slice( 0, atIdx ).toLowerCase();
		const version = entry.slice( atIdx + 1 );

		if ( ! name || ! version ) {
			throw new Error( `Invalid format: "${ entry }". Expected name@version (e.g. axios@1.14.1)` );
		}

		results.push( { name, version } );
	}

	return results;
}

// ---------------------------------------------------------------------------
// Tool detection
// ---------------------------------------------------------------------------

// nvm is excluded: it's a shell function on Unix (which/where fails) and its
// paths are resolved from the filesystem in resolveNvmPaths() instead.
const TOOLS = [ 'npm', 'yarn', 'pnpm' ] as const;

/**
 * Detects which package manager tools are available on the system.
 * Returns a map of tool name to resolved binary path.
 */
export async function detectTools(): Promise<Record<string, string>> {
	const whichCmd = process.platform === 'win32' ? 'where' : 'which';
	const results: Record<string, string> = {};

	const settled = await Promise.allSettled(
		TOOLS.map( async ( tool ) => {
			const binPath = await execInShell( `${ whichCmd } ${ tool }`, { timeout: 5000 } );
			return { tool, binPath: binPath.split( /\r?\n/ )[ 0 ] };
		} ),
	);

	for ( const result of settled ) {
		if ( result.status === 'fulfilled' ) {
			results[ result.value.tool ] = result.value.binPath;
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export interface ToolPaths {
	npmGlobalRoot?: string;
	npmCacheDir?: string;
	yarnCacheDir?: string;
	yarnGlobalDir?: string;
	pnpmGlobalRoot?: string;
	pnpmStoreDir?: string;
	nvmNodeVersionPaths?: string[];
}

/**
 * Extracts the last absolute path from command output.
 * Tools like pnpm may print update notices or warnings before the actual path.
 * @param output
 */
function extractAbsolutePath( output: string ): string | undefined {
	const lines = output.split( /\r?\n/ ).filter( Boolean );
	for ( let i = lines.length - 1; i >= 0; i-- ) {
		const line = lines[ i ].trim();
		if ( path.isAbsolute( line ) ) {
			return line;
		}
	}
	return undefined;
}

/**
 * Resolves filesystem paths for global installs and caches of detected tools.
 * @param tools
 */
export async function resolveToolPaths( tools: Record<string, string> ): Promise<ToolPaths> {
	const paths: ToolPaths = {};

	const tasks: Array<Promise<void>> = [];

	if ( tools.npm ) {
		tasks.push(
			execInShell( 'npm root -g', { timeout: 10_000 } )
				.then( ( p ) => {
					paths.npmGlobalRoot = extractAbsolutePath( p );
				} )
				.catch( () => {} ),
			execInShell( 'npm config get cache', { timeout: 10_000 } )
				.then( ( p ) => {
					paths.npmCacheDir = extractAbsolutePath( p );
				} )
				.catch( () => {} ),
		);
	}

	if ( tools.yarn ) {
		tasks.push(
			execInShell( 'yarn cache dir', { timeout: 10_000 } )
				.then( ( p ) => {
					paths.yarnCacheDir = extractAbsolutePath( p );
				} )
				.catch( () => {} ),
			execInShell( 'yarn global dir', { timeout: 10_000 } )
				.then( ( p ) => {
					paths.yarnGlobalDir = extractAbsolutePath( p );
				} )
				.catch( () => {} ),
		);
	}

	if ( tools.pnpm ) {
		tasks.push(
			execInShell( 'pnpm root -g', { timeout: 10_000 } )
				.then( ( p ) => {
					paths.pnpmGlobalRoot = extractAbsolutePath( p );
				} )
				.catch( () => {} ),
			execInShell( 'pnpm store path', { timeout: 10_000 } )
				.then( ( p ) => {
					paths.pnpmStoreDir = extractAbsolutePath( p );
				} )
				.catch( () => {} ),
		);
	}

	// nvm is a shell function, not a binary -- `which nvm` fails even in a
	// login shell. Always try to resolve nvm paths from the filesystem since
	// resolveNvmPaths() reads ~/.nvm/versions/node/ directly.
	tasks.push(
		resolveNvmPaths().then( ( nvmPaths ) => {
			if ( nvmPaths.length > 0 ) {
				paths.nvmNodeVersionPaths = nvmPaths;
			}
		} ).catch( () => {} ),
	);

	// Electron does not inherit the user's shell PATH, so shell-based commands
	// (npm root -g, pnpm root -g, etc.) often fail. Resolve from the
	// filesystem as a fallback.
	tasks.push(
		resolvePnpmGlobalRoot().then( ( p ) => {
			if ( p && ! paths.pnpmGlobalRoot ) {
				paths.pnpmGlobalRoot = p;
			}
		} ).catch( () => {} ),
		resolveNpmGlobalRootFallback().then( ( p ) => {
			if ( p && ! paths.npmGlobalRoot ) {
				paths.npmGlobalRoot = p;
			}
		} ).catch( () => {} ),
	);

	await Promise.allSettled( tasks );
	return paths;
}

/**
 * Resolves global node_modules paths for all nvm-managed Node versions.
 *
 * Unix (nvm): versions live at $NVM_DIR/versions/node/v<x>/lib/node_modules.
 * Windows (nvm-windows): versions live at %NVM_HOME%\v<x>\node_modules (no lib/).
 * Both are probed so the scanner works across macOS, Linux, and Windows.
 */
async function resolveNvmPaths(): Promise<string[]> {
	const results: string[] = [];

	if ( process.platform === 'win32' ) {
		// nvm-windows uses NVM_HOME (or NVM_SYMLINK as the active pointer).
		const nvmHome = process.env.NVM_HOME;
		if ( nvmHome ) {
			try {
				const entries = await fs.readdir( nvmHome );
				for ( const e of entries ) {
					if ( ! e.startsWith( 'v' ) ) {
						continue;
					}
					const nmPath = path.join( nvmHome, e, 'node_modules' );
					if ( await fs.pathExists( nmPath ) ) {
						results.push( nmPath );
					}
				}
			} catch {
				// NVM_HOME unreadable
			}
		}
	} else {
		// macOS / Linux: nvm stores versions under $NVM_DIR/versions/node/
		const nvmDir = process.env.NVM_DIR ||
			path.join( process.env.HOME || '', '.nvm' );
		const versionsDir = path.join( nvmDir, 'versions', 'node' );

		try {
			const entries = await fs.readdir( versionsDir );
			for ( const e of entries ) {
				if ( e.startsWith( 'v' ) ) {
					results.push( path.join( versionsDir, e, 'lib', 'node_modules' ) );
				}
			}
		} catch {
			// nvm not installed or versionsDir missing
		}
	}

	return results;
}

/**
 * Resolves pnpm's global root from the filesystem (no shell commands).
 *
 * pnpm stores global packages at a platform-specific location:
 *   macOS:   ~/Library/pnpm/global/<store-version>/node_modules
 *   Linux:   ~/.local/share/pnpm/global/<store-version>/node_modules
 *   Windows: %LOCALAPPDATA%/pnpm/global/<store-version>/node_modules
 */
async function resolvePnpmGlobalRoot(): Promise<string | null> {
	const home = process.env.HOME || process.env.USERPROFILE || '';
	const candidates: string[] = [];

	if ( process.platform === 'darwin' ) {
		candidates.push( path.join( home, 'Library', 'pnpm', 'global' ) );
	} else if ( process.platform === 'win32' ) {
		if ( process.env.LOCALAPPDATA ) {
			candidates.push( path.join( process.env.LOCALAPPDATA, 'pnpm', 'global' ) );
		}
	} else {
		candidates.push( path.join( home, '.local', 'share', 'pnpm', 'global' ) );
	}

	for ( const globalDir of candidates ) {
		try {
			const entries = await fs.readdir( globalDir );
			// Store version directories are numeric (e.g. "5"); pick the highest
			const storeVersions = entries.filter( ( e: string ) => /^\d+$/.test( e ) ).sort();
			for ( let i = storeVersions.length - 1; i >= 0; i-- ) {
				const nmPath = path.join( globalDir, storeVersions[ i ], 'node_modules' );
				if ( await fs.pathExists( nmPath ) ) {
					return nmPath;
				}
			}
		} catch {
			// Directory doesn't exist
		}
	}

	return null;
}

/**
 * Resolves the npm global root from common filesystem locations.
 * Used as a fallback when shell-based `npm root -g` fails inside Electron.
 */
async function resolveNpmGlobalRootFallback(): Promise<string | null> {
	const candidates: string[] = [];

	if ( process.platform === 'win32' ) {
		if ( process.env.APPDATA ) {
			candidates.push( path.join( process.env.APPDATA, 'npm', 'node_modules' ) );
		}
	} else {
		candidates.push( '/usr/local/lib/node_modules' );
		candidates.push( '/usr/lib/node_modules' );
	}

	for ( const candidate of candidates ) {
		if ( await fs.pathExists( candidate ) ) {
			return candidate;
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Lock file parsers
// ---------------------------------------------------------------------------

interface ParsedDep {
	name: string;
	version: string;
	isDirect: boolean;
}

/**
 * Parses package-lock.json content (v1, v2, v3 formats).
 * @param content
 */
export function parsePackageLockJson( content: string ): ParsedDep[] {
	const data = JSON.parse( content );
	const deps: ParsedDep[] = [];

	// v2/v3: uses "packages" key with node_modules/ path prefixes
	if ( data.packages && typeof data.packages === 'object' ) {
		for ( const [ key, value ] of Object.entries( data.packages ) ) {
			if ( ! key || key === '' ) {
				continue; // root package
			}
			const pkg = value as { version?: string; name?: string };
			if ( ! pkg.version ) {
				continue;
			}

			// Extract package name from the key path
			const name = extractNameFromLockPath( key );
			if ( ! name ) {
				continue;
			}

			// Direct if only one level deep: node_modules/<name>
			const segments = key.replace( /^node_modules\//, '' ).split( 'node_modules/' );
			const isDirect = segments.length === 1;

			deps.push( { name, version: pkg.version, isDirect } );
		}
		return deps;
	}

	// v1: nested "dependencies" object
	if ( data.dependencies && typeof data.dependencies === 'object' ) {
		walkV1Dependencies( data.dependencies, true, deps );
	}

	return deps;
}

function extractNameFromLockPath( key: string ): string | null {
	// key looks like "node_modules/axios" or "node_modules/@scope/name"
	// or nested: "node_modules/foo/node_modules/bar"
	const parts = key.split( 'node_modules/' );
	const last = parts[ parts.length - 1 ];
	return last || null;
}

function walkV1Dependencies(
	deps: Record<string, any>,
	isDirect: boolean,
	result: ParsedDep[],
): void {
	for ( const [ name, info ] of Object.entries( deps ) ) {
		if ( info.version ) {
			result.push( { name, version: info.version, isDirect } );
		}
		if ( info.dependencies && typeof info.dependencies === 'object' ) {
			walkV1Dependencies( info.dependencies, false, result );
		}
	}
}

/**
 * Parses yarn.lock content (v1 format).
 * @param content
 */
export function parseYarnLock( content: string ): ParsedDep[] {
	const deps: ParsedDep[] = [];
	// Split into blocks separated by blank lines
	const blocks = content.split( /\n\n+/ );

	for ( const block of blocks ) {
		const lines = block.trim().split( '\n' );
		if ( lines.length < 2 ) {
			continue;
		}

		const header = lines[ 0 ];
		// Skip comments and metadata
		if ( header.startsWith( '#' ) || header.startsWith( '__' ) ) {
			continue;
		}

		// Extract package name from header like '"axios@^1.0.0", "axios@~1.2.0":'
		// or 'axios@^1.0.0:'
		const name = extractYarnLockName( header );
		if ( ! name ) {
			continue;
		}

		// Find version line
		let version: string | null = null;
		for ( const line of lines ) {
			const vMatch = line.match( /^\s+version\s+"([^"]+)"/ );
			if ( vMatch ) {
				version = vMatch[ 1 ];
				break;
			}
		}

		if ( version ) {
			// yarn.lock doesn't distinguish direct/transitive; mark all transitive (conservative)
			deps.push( { name, version, isDirect: false } );
		}
	}

	return deps;
}

function extractYarnLockName( header: string ): string | null {
	// Remove trailing colon and quotes
	const cleaned = header.replace( /:$/, '' ).trim();

	// Take the first entry if there are multiple (comma-separated)
	const firstEntry = cleaned.split( ',' )[ 0 ].trim().replace( /^"/, '' ).replace( /"$/, '' );

	// Find the last '@' that separates name from version range
	if ( firstEntry.startsWith( '@' ) ) {
		const atIdx = firstEntry.indexOf( '@', 1 );
		return atIdx > 0 ? firstEntry.slice( 0, atIdx ) : null;
	}

	const atIdx = firstEntry.indexOf( '@' );
	return atIdx > 0 ? firstEntry.slice( 0, atIdx ) : null;
}

/**
 * Parses pnpm-lock.yaml content using line-based parsing (no YAML lib).
 * Supports both v6 (/<name>/<version>:) and v9 (<name>@<version>:) formats.
 * @param content
 */
export function parsePnpmLockYaml( content: string ): ParsedDep[] {
	const deps: ParsedDep[] = [];
	const lines = content.split( '\n' );

	let inPackages = false;

	for ( const line of lines ) {
		// Detect the packages section
		if ( /^packages:/.test( line ) ) {
			inPackages = true;
			continue;
		}

		// Stop if we hit another top-level key
		if ( inPackages && /^\S/.test( line ) && ! /^\s/.test( line ) ) {
			break;
		}

		if ( ! inPackages ) {
			continue;
		}

		// v9 format: '  <name>@<version>:'
		// v6 format: '  /<name>/<version>:'
		const v9Match = line.match( /^\s{2,4}'?(@?[^@'/]+(?:\/[^@'/]+)?)@([^':]+)'?:/ );
		if ( v9Match ) {
			deps.push( { name: v9Match[ 1 ], version: v9Match[ 2 ], isDirect: false } );
			continue;
		}

		const v6Match = line.match( /^\s{2,4}'?\/((?:@[^/]+\/)?[^/]+)\/([^':]+)'?:/ );
		if ( v6Match ) {
			deps.push( { name: v6Match[ 1 ], version: v6Match[ 2 ], isDirect: false } );
		}
	}

	return deps;
}

// ---------------------------------------------------------------------------
// node_modules traversal
// ---------------------------------------------------------------------------

const MAX_DEPTH = 10;

/**
 * Recursively scans a node_modules directory for packages matching the targets.
 * @param baseDir
 * @param targets
 * @param scope
 * @param locationLabel
 * @param depth
 */
export async function scanNodeModules(
	baseDir: string,
	targets: VulnPackageQuery[],
	scope: VulnScanMatch['scope'],
	locationLabel: string,
	depth: number = 0,
): Promise<VulnScanMatch[]> {
	if ( depth > MAX_DEPTH ) {
		return [];
	}

	const nodeModulesDir = depth === 0
		? path.join( baseDir, 'node_modules' )
		: baseDir;

	let entries: string[];
	try {
		entries = await fs.readdir( nodeModulesDir );
	} catch {
		return [];
	}

	const matches: VulnScanMatch[] = [];

	for ( const entry of entries ) {
		if ( entry.startsWith( '.' ) ) {
			continue;
		}

		const entryPath = path.join( nodeModulesDir, entry );

		// Handle scoped packages (@scope/name)
		if ( entry.startsWith( '@' ) ) {
			let scopedEntries: string[];
			try {
				scopedEntries = await fs.readdir( entryPath );
			} catch {
				continue;
			}
			for ( const scopedEntry of scopedEntries ) {
				const scopedName = `${ entry }/${ scopedEntry }`;
				const scopedPath = path.join( entryPath, scopedEntry );
				const pkgMatch = await checkPackageJson( scopedPath, scopedName, targets, scope, locationLabel, depth );
				if ( pkgMatch ) {
					matches.push( pkgMatch );
				}
				// Recurse into nested node_modules
				const nestedNm = path.join( scopedPath, 'node_modules' );
				if ( await fs.pathExists( nestedNm ) ) {
					const nested = await scanNodeModules( nestedNm, targets, scope, locationLabel, depth + 1 );
					matches.push( ...nested );
				}
			}
			continue;
		}

		const pkgMatch = await checkPackageJson( entryPath, entry, targets, scope, locationLabel, depth );
		if ( pkgMatch ) {
			matches.push( pkgMatch );
		}

		// Recurse into nested node_modules
		const nestedNm = path.join( entryPath, 'node_modules' );
		if ( await fs.pathExists( nestedNm ) ) {
			const nested = await scanNodeModules( nestedNm, targets, scope, locationLabel, depth + 1 );
			matches.push( ...nested );
		}
	}

	return matches;
}

async function checkPackageJson(
	pkgDir: string,
	expectedName: string,
	targets: VulnPackageQuery[],
	scope: VulnScanMatch['scope'],
	locationLabel: string,
	depth: number,
): Promise<VulnScanMatch | null> {
	const pkgJsonPath = path.join( pkgDir, 'package.json' );

	try {
		const content = await fs.readFile( pkgJsonPath, 'utf8' );
		const pkg = JSON.parse( content );
		const name = ( pkg.name || expectedName ).toLowerCase();
		const version = pkg.version;

		if ( ! version ) {
			return null;
		}

		const match = targets.find( ( t ) => t.name === name && t.version === version );
		if ( ! match ) {
			return null;
		}

		return {
			packageName: name,
			version,
			location: locationLabel,
			locationPath: pkgDir,
			source: 'node_modules',
			depType: depth === 0 ? 'direct' : 'transitive',
			scope,
		};
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Site directory scanner
// ---------------------------------------------------------------------------

/**
 * Scans a Local site directory for vulnerable packages in lock files and node_modules.
 * Checks the site root and WordPress theme/plugin directories.
 * @param site
 * @param targets
 * @param scope
 * @param onProgress
 */
export async function scanSiteDirectory(
	site: SiteInfo,
	targets: VulnPackageQuery[],
	scope: VulnScanMatch['scope'],
	onProgress: ( msg: string ) => void,
): Promise<VulnScanMatch[]> {
	const matches: VulnScanMatch[] = [];
	const label = scope === 'current-site' ? 'Current site' : site.name;

	// Directories to check for lock files and node_modules
	const dirsToScan: string[] = [ site.path ];

	// Use site.webRoot (e.g. app/public or app/wordpress) instead of hardcoding
	const wpContentBase = path.join( site.webRoot, 'wp-content' );

	// Scan wp-content itself (lock files can live here directly)
	if ( await fs.pathExists( wpContentBase ) ) {
		dirsToScan.push( wpContentBase );
	}

	// Also check theme and plugin directories
	for ( const subdir of [ 'themes', 'plugins' ] ) {
		const parentDir = path.join( wpContentBase, subdir );
		try {
			const entries = await fs.readdir( parentDir );
			for ( const entry of entries ) {
				const fullPath = path.join( parentDir, entry );
				const stat = await fs.stat( fullPath );
				if ( stat.isDirectory() ) {
					dirsToScan.push( fullPath );
				}
			}
		} catch {
			// Directory doesn't exist, skip
		}
	}

	for ( const dir of dirsToScan ) {
		const dirLabel = dir === site.path ? label : `${ label } (${ path.relative( site.path, dir ) })`;

		// Parse lock files
		const lockFileMatches = await scanLockFiles( dir, targets, scope, dirLabel );
		matches.push( ...lockFileMatches );

		// Scan node_modules
		if ( await fs.pathExists( path.join( dir, 'node_modules' ) ) ) {
			onProgress( `Scanning node_modules in ${ dirLabel }...` );
			const nmMatches = await scanNodeModules( dir, targets, scope, dirLabel );
			matches.push( ...nmMatches );
		}
	}

	// Add siteName to all matches
	for ( const m of matches ) {
		m.siteName = site.name;
	}

	return matches;
}

async function scanLockFiles(
	dir: string,
	targets: VulnPackageQuery[],
	scope: VulnScanMatch['scope'],
	locationLabel: string,
): Promise<VulnScanMatch[]> {
	const matches: VulnScanMatch[] = [];

	const lockFiles: Array<{ file: string; parser: ( content: string ) => ParsedDep[] }> = [
		{ file: 'package-lock.json', parser: parsePackageLockJson },
		{ file: 'yarn.lock', parser: parseYarnLock },
		{ file: 'pnpm-lock.yaml', parser: parsePnpmLockYaml },
	];

	for ( const { file, parser } of lockFiles ) {
		const filePath = path.join( dir, file );
		try {
			if ( ! await fs.pathExists( filePath ) ) {
				continue;
			}

			const content = await fs.readFile( filePath, 'utf8' );
			const deps = parser( content );

			for ( const dep of deps ) {
				const match = targets.find( ( t ) => t.name === dep.name && t.version === dep.version );
				if ( match ) {
					matches.push( {
						packageName: dep.name,
						version: dep.version,
						location: `${ locationLabel } (${ file })`,
						locationPath: filePath,
						source: 'lock-file',
						depType: dep.isDirect ? 'direct' : 'transitive',
						scope,
					} );
				}
			}
		} catch {
			// Skip malformed lock files
		}
	}

	return matches;
}

// ---------------------------------------------------------------------------
// Global and cache scanners
// ---------------------------------------------------------------------------

/**
 * Scans global package manager installations for vulnerable packages.
 * @param toolPaths
 * @param targets
 * @param onProgress
 */
export async function scanGlobalInstalls(
	toolPaths: ToolPaths,
	targets: VulnPackageQuery[],
	onProgress: ( msg: string ) => void,
): Promise<{ matches: VulnScanMatch[]; scannedRoots: string[] }> {
	const matches: VulnScanMatch[] = [];
	const roots: Array<{ label: string; dir: string }> = [];

	if ( toolPaths.npmGlobalRoot ) {
		roots.push( { label: 'npm global', dir: toolPaths.npmGlobalRoot } );
	}
	if ( toolPaths.pnpmGlobalRoot ) {
		roots.push( { label: 'pnpm global', dir: toolPaths.pnpmGlobalRoot } );
	}
	if ( toolPaths.yarnGlobalDir ) {
		const yarnNm = path.join( toolPaths.yarnGlobalDir, 'node_modules' );
		if ( await fs.pathExists( yarnNm ) ) {
			roots.push( { label: 'yarn global', dir: toolPaths.yarnGlobalDir } );
		}
	}

	if ( toolPaths.nvmNodeVersionPaths ) {
		// Collect already-added node_modules paths so nvm versions covered by
		// npm/pnpm/yarn global roots are not scanned twice.
		const seen = new Set( roots.map( ( r ) => {
			const isNm = path.basename( r.dir ) === 'node_modules';
			return isNm ? r.dir : path.join( r.dir, 'node_modules' );
		} ) );

		for ( const nvmPath of toolPaths.nvmNodeVersionPaths ) {
			if ( seen.has( nvmPath ) ) {
				continue;
			}
			if ( await fs.pathExists( nvmPath ) ) {
				const version = path.basename( path.dirname( path.dirname( nvmPath ) ) );
				roots.push( { label: `nvm (${ version })`, dir: path.dirname( nvmPath ) } );
			}
		}
	}

	for ( const { label, dir } of roots ) {
		onProgress( `Scanning ${ label } packages...` );
		// Global roots are themselves node_modules directories (npm root -g returns the node_modules path)
		// So we need to check if 'dir' IS node_modules or CONTAINS node_modules
		const isNmDir = path.basename( dir ) === 'node_modules';
		const scanDir = isNmDir ? path.dirname( dir ) : dir;
		const nmMatches = await scanNodeModules( scanDir, targets, 'global', label );
		matches.push( ...nmMatches );
	}

	return { matches, scannedRoots: roots.map( ( r ) => r.label ) };
}

/**
 * Scans package manager caches for vulnerable packages (best-effort).
 * @param toolPaths
 * @param targets
 * @param onProgress
 */
export async function scanCaches(
	toolPaths: ToolPaths,
	targets: VulnPackageQuery[],
	onProgress: ( msg: string ) => void,
): Promise<{ matches: VulnScanMatch[]; errors: string[]; scannedRoots: string[] }> {
	const matches: VulnScanMatch[] = [];
	const errors: string[] = [];
	const scannedRoots: string[] = [];

	// npm cache: scan _npx directory (shallow)
	if ( toolPaths.npmCacheDir ) {
		onProgress( 'Scanning npm cache...' );
		const npxDir = path.join( toolPaths.npmCacheDir, '_npx' );
		if ( await fs.pathExists( npxDir ) ) {
			scannedRoots.push( 'npm cache' );
			const cacheMatches = await scanCacheDir( npxDir, targets, 'npm cache', 3 );
			matches.push( ...cacheMatches );
		}
	}

	// yarn cache: scan for package.json files in cache entries
	if ( toolPaths.yarnCacheDir ) {
		onProgress( 'Scanning yarn cache...' );
		scannedRoots.push( 'yarn cache' );
		const cacheMatches = await scanCacheDir( toolPaths.yarnCacheDir, targets, 'yarn cache', 3 );
		matches.push( ...cacheMatches );
	}

	// pnpm store: content-addressable, not feasible to scan by name
	if ( toolPaths.pnpmStoreDir ) {
		errors.push( 'pnpm store is content-addressable and cannot be scanned by package name' );
	}

	return { matches, errors, scannedRoots };
}

async function scanCacheDir(
	cacheDir: string,
	targets: VulnPackageQuery[],
	label: string,
	maxDepth: number,
	currentDepth: number = 0,
): Promise<VulnScanMatch[]> {
	if ( currentDepth >= maxDepth ) {
		return [];
	}

	const matches: VulnScanMatch[] = [];
	let entries: string[];
	try {
		entries = await fs.readdir( cacheDir );
	} catch {
		return [];
	}

	for ( const entry of entries ) {
		if ( entry.startsWith( '.' ) ) {
			continue;
		}

		const entryPath = path.join( cacheDir, entry );
		let stat;
		try {
			stat = await fs.stat( entryPath );
		} catch {
			continue;
		}

		if ( ! stat.isDirectory() ) {
			continue;
		}

		// Check for package.json in this directory
		const pkgJsonPath = path.join( entryPath, 'package.json' );
		try {
			if ( await fs.pathExists( pkgJsonPath ) ) {
				const content = await fs.readFile( pkgJsonPath, 'utf8' );
				const pkg = JSON.parse( content );
				const name = ( pkg.name || '' ).toLowerCase();
				const version = pkg.version;

				if ( name && version ) {
					const match = targets.find( ( t ) => t.name === name && t.version === version );
					if ( match ) {
						matches.push( {
							packageName: name,
							version,
							location: label,
							locationPath: entryPath,
							source: 'node_modules',
							depType: 'direct',
							scope: 'cache',
						} );
					}
				}
			}
		} catch {
			// Skip malformed package.json
		}

		// Recurse into subdirectories
		const nested = await scanCacheDir( entryPath, targets, label, maxDepth, currentDepth + 1 );
		matches.push( ...nested );
	}

	return matches;
}

// ---------------------------------------------------------------------------
// Top-level scan coordinator
// ---------------------------------------------------------------------------

export interface SiteInfo {
	path: string;
	name: string;
	webRoot: string;
}

/**
 * Runs a complete vulnerability scan across all requested scopes.
 * @param options
 * @param currentSite
 * @param allSites
 * @param onProgress
 */
export async function runVulnScan(
	options: VulnScanOptions,
	currentSite: SiteInfo,
	allSites: SiteInfo[],
	onProgress: ( msg: string ) => void,
): Promise<VulnScanResult> {
	const { packages: targets, scanAllSites, includeGlobal, includeCaches } = options;
	const allMatches: VulnScanMatch[] = [];
	const allErrors: string[] = [];
	let scannedLocations = 0;

	// Detect tools and resolve paths (needed for global/cache scans)
	onProgress( 'Detecting package managers...' );
	const tools = await detectTools();
	const toolsDetected = Object.keys( tools );
	onProgress( `Found: ${ toolsDetected.length > 0 ? toolsDetected.join( ', ' ) : 'none' }` );

	let toolPaths: ToolPaths = {};
	if ( includeGlobal || includeCaches ) {
		onProgress( 'Resolving package manager paths...' );
		toolPaths = await resolveToolPaths( tools );
		if ( toolPaths.npmGlobalRoot ) {
			onProgress( `npm global: ${ toolPaths.npmGlobalRoot }` );
		}
		if ( toolPaths.pnpmGlobalRoot ) {
			onProgress( `pnpm global: ${ toolPaths.pnpmGlobalRoot }` );
		}
		if ( toolPaths.yarnGlobalDir ) {
			onProgress( `yarn global: ${ toolPaths.yarnGlobalDir }` );
		}
	}

	// Scan current site (always)
	onProgress( `Scanning current site: ${ currentSite.name }...` );
	const currentMatches = await scanSiteDirectory(
		currentSite, targets, 'current-site', onProgress,
	);
	allMatches.push( ...currentMatches );
	scannedLocations++;

	// Scan all other sites (optional)
	if ( scanAllSites ) {
		const otherSites = allSites.filter( ( s ) => s.path !== currentSite.path );
		onProgress( `Scanning ${ otherSites.length } additional site(s)...` );
		for ( const site of otherSites ) {
			onProgress( `Scanning site: ${ site.name }...` );
			const siteMatches = await scanSiteDirectory(
				site, targets, 'local-site', onProgress,
			);
			allMatches.push( ...siteMatches );
			scannedLocations++;
		}
	}

	// Scan global installations (optional)
	let globalRootsScanned: string[] = [];
	if ( includeGlobal ) {
		onProgress( 'Scanning global installations...' );
		const globalResult = await scanGlobalInstalls( toolPaths, targets, onProgress );
		allMatches.push( ...globalResult.matches );
		globalRootsScanned = globalResult.scannedRoots;
		scannedLocations++;
	}

	// Scan caches (optional)
	let cacheRootsScanned: string[] = [];
	if ( includeCaches ) {
		onProgress( 'Scanning package caches...' );
		const cacheResult = await scanCaches( toolPaths, targets, onProgress );
		allMatches.push( ...cacheResult.matches );
		allErrors.push( ...cacheResult.errors );
		cacheRootsScanned = cacheResult.scannedRoots;
		scannedLocations++;
	}

	onProgress( `Scan complete. Found ${ allMatches.length } match(es).` );

	return {
		matches: allMatches,
		toolsDetected,
		errors: allErrors,
		scannedLocations,
		globalRootsScanned,
		cacheRootsScanned,
	};
}
