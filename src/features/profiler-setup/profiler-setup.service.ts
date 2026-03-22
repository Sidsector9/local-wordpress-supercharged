/**
 * profiler-setup.service.ts -- Pure functions for checking, installing, and
 * verifying profiler tooling (xhprof PHP extension and k6 load test binary).
 *
 * All functions are stateless and take their dependencies as arguments,
 * making them independently testable and reusable from any context.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { execFile } from 'child_process';
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import {
	ProfilerCache,
	ProfilerSetupStatus,
	SuperchargedCache,
	ToolCheckResult,
} from '../../shared/types';

/** Pinned k6 version for reproducible installs. */
export const K6_VERSION = 'v0.54.0';

/** GitHub repo URL for the xhprof extension source. */
export const XHPROF_REPO = 'https://github.com/longxinH/xhprof.git';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the base directory for xhprof compiled .so caches.
 * Layout: ~/.wp-profiler-cache/xhprof/{phpVersion}/xhprof.so
 */
export function getXhprofCacheDir(phpVersion: string): string {
	return path.join(os.homedir(), '.wp-profiler-cache', 'xhprof', phpVersion);
}

/** Returns the full path to the cached xhprof.so for a PHP version. */
export function getXhprofSoPath(phpVersion: string): string {
	return path.join(getXhprofCacheDir(phpVersion), 'xhprof.so');
}

/** Returns the directory where the xhprof source repo is cloned. */
export function getXhprofSrcDir(): string {
	return path.join(os.homedir(), '.wp-profiler-cache', 'xhprof', 'src');
}

/** Returns the path to the k6 binary on the host. */
export function getK6BinPath(): string {
	const name = process.platform === 'win32' ? 'k6.exe' : 'k6';
	return path.join(os.homedir(), '.local', 'bin', name);
}

/**
 * Returns the PHP conf.d directory for a site, where per-site ini
 * snippets are placed so the PHP process picks them up on start.
 */
export function getPhpConfDPath(site: Local.Site): string {
	return path.join(site.paths.conf, 'php', 'conf.d');
}

// ---------------------------------------------------------------------------
// Promisified execFile helper
// ---------------------------------------------------------------------------

interface ExecOpts {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout?: number;
}

/**
 * Promise wrapper around child_process.execFile.
 * Always uses argument arrays -- never shell strings.
 */
function execFileAsync(
	command: string,
	args: string[],
	opts: ExecOpts = {},
): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(command, args, {
			cwd: opts.cwd,
			env: opts.env,
			timeout: opts.timeout ?? 120_000,
			maxBuffer: 10 * 1024 * 1024,
		}, (error, stdout, stderr) => {
			if (error) {
				const msg = stderr?.trim() || error.message;
				reject(new Error(msg));
			} else {
				resolve(stdout.trim());
			}
		});
	});
}

/**
 * Runs a command string through the user's login shell.
 *
 * Electron apps don't inherit the user's shell PATH, so tools like
 * autoconf, make, and gcc are not available via execFile. Running
 * through a login shell (`-l`) ensures the full user environment
 * (PATH, etc.) is loaded.
 *
 * On Windows, uses cmd.exe /c instead.
 */
function execInShell(
	command: string,
	opts: ExecOpts = {},
): Promise<string> {
	if (process.platform === 'win32') {
		const comspec = process.env.ComSpec || 'cmd.exe';
		return execFileAsync(comspec, ['/c', command], opts);
	}

	const shell = process.env.SHELL || '/bin/sh';
	return execFileAsync(shell, ['-l', '-c', command], opts);
}

// ---------------------------------------------------------------------------
// xhprof functions
// ---------------------------------------------------------------------------

/**
 * Finds Local's PHP extension directory for a given PHP service.
 * This is where .so files are loaded from at runtime.
 *
 * Path pattern: {phpPrefix}/lib/php/extensions/no-debug-non-zts-{api}/
 */
export async function findExtensionDir(phpPrefix: string): Promise<string | null> {
	const extBase = path.join(phpPrefix, 'lib', 'php', 'extensions');

	try {
		const entries = await fs.readdir(extBase);
		const ntsDir = entries.find((e: string) => e.startsWith('no-debug-non-zts-'));
		if (!ntsDir) return null;
		return path.join(extBase, ntsDir);
	} catch {
		return null;
	}
}

/**
 * Checks whether a compiled xhprof.so exists in the host cache
 * for the given PHP version.
 */
export function checkXhprofCached(phpVersion: string): boolean {
	return fs.existsSync(getXhprofSoPath(phpVersion));
}

/**
 * Clones the xhprof source repo into the host cache if not already present.
 * Skips the clone if the extension/ subdirectory already exists.
 */
export async function ensureXhprofSource(
	onLog: (msg: string) => void,
): Promise<void> {
	const srcDir = getXhprofSrcDir();
	const extensionDir = path.join(srcDir, 'extension');

	if (fs.existsSync(extensionDir)) {
		onLog('xhprof source code found locally');
		return;
	}

	onLog('Cloning xhprof source...');
	await fs.ensureDir(path.dirname(srcDir));
	await execFileAsync('git', ['clone', '--depth', '1', XHPROF_REPO, srcDir]);
	onLog('xhprof source cloned');
}

/**
 * Local's lightning-services ships phpize and php-config with hardcoded
 * paths from the CI build machine (e.g. /Users/distiller/project/...).
 * These don't exist on the user's machine. Additionally, phpize rejects
 * paths containing spaces (e.g. "Application Support" on macOS).
 *
 * To solve both problems we:
 * 1. Create a symlink at a space-free path pointing to the PHP install dir
 * 2. Patch phpize/php-config to use that symlink path as the prefix
 *
 * @param scriptPath -- Path to the original phpize or php-config script.
 * @param symlinkPrefix -- A space-free symlink pointing to the PHP dir.
 * @param patchDir -- Directory to write the patched script into.
 * @returns Path to the patched script.
 */
async function patchPhpScript(
	scriptPath: string,
	symlinkPrefix: string,
	patchDir: string,
): Promise<string> {
	const content = await fs.readFile(scriptPath, 'utf8');

	// Extract the baked-in prefix from the script (first prefix= line)
	const match = content.match(/^prefix='([^']+)'/m)
		|| content.match(/^prefix="([^"]+)"/m);

	if (!match) {
		return scriptPath;
	}

	const bakedPrefix = match[1];

	// Replace all occurrences of the baked-in prefix with the symlink path
	const patched = content.split(bakedPrefix).join(symlinkPrefix);
	const patchedPath = path.join(patchDir, path.basename(scriptPath));
	await fs.writeFile(patchedPath, patched);
	fs.chmodSync(patchedPath, 0o755);

	return patchedPath;
}

/**
 * Creates a symlink at a space-free path pointing to the PHP install
 * directory. phpize and the configure script reject paths with spaces,
 * so this symlink provides a clean path for compilation.
 *
 * @returns The space-free symlink path.
 */
async function ensureSpaceFreePhpLink(
	phpPrefix: string,
	phpVersion: string,
): Promise<string> {
	const linkPath = path.join(
		os.homedir(),
		'.wp-profiler-cache',
		`php-${phpVersion.replace(/[^a-zA-Z0-9._-]/g, '_')}-link`,
	);

	// Remove existing symlink if it points to the wrong target
	if (fs.existsSync(linkPath)) {
		const existing = await fs.readlink(linkPath).catch(() => null);
		if (existing === phpPrefix) {
			return linkPath;
		}
		await fs.remove(linkPath);
	}

	await fs.ensureSymlink(phpPrefix, linkPath);
	return linkPath;
}

/**
 * Compiles xhprof from source for the given PHP version using the
 * build tools provided by Local's lightning-services.
 *
 * Handles two platform-specific issues:
 *   1. Hardcoded CI paths in phpize/php-config (patched at runtime)
 *   2. Spaces in paths on macOS (symlink workaround)
 *
 * All compilation steps run through the user's login shell via
 * execInShell() so that tools like autoconf, make, and gcc are
 * on PATH. Electron apps don't inherit the user's shell PATH, so
 * running through a login shell is required.
 */
export async function compileXhprof(
	phpVersion: string,
	phpizeBin: string,
	phpConfigBin: string,
	env: NodeJS.ProcessEnv,
	onLog: (msg: string) => void,
): Promise<void> {
	const extensionDir = path.join(getXhprofSrcDir(), 'extension');

	// The actual PHP prefix is the directory two levels above bin/phpize
	const actualPrefix = path.dirname(path.dirname(phpizeBin));

	onLog(`Compiling xhprof for PHP ${phpVersion}...`);

	// Create a space-free symlink to the PHP directory
	const symlinkPrefix = await ensureSpaceFreePhpLink(actualPrefix, phpVersion);

	// Create a temp directory for patched scripts
	const patchDir = path.join(os.homedir(), '.wp-profiler-cache', 'patched-php-tools');
	await fs.ensureDir(patchDir);

	// Patch phpize and php-config to use the symlink prefix
	onLog('Patching PHP build tools...');
	const patchedPhpize = await patchPhpScript(phpizeBin, symlinkPrefix, patchDir);
	const patchedPhpConfig = await patchPhpScript(phpConfigBin, symlinkPrefix, patchDir);

	// Clean stale build artifacts from any previous failed compilation.
	// Never delete config.m4 (part of xhprof source, needed by phpize).
	const staleItems = ['configure', 'configure.ac', 'build', 'autom4te.cache',
		'config.h.in', 'config.h', 'config.log', 'config.status',
		'Makefile', '.libs', 'modules', 'acinclude.m4', 'aclocal.m4',
		'run-tests.php', 'mkinstalldirs', 'install-sh'];
	for (const item of staleItems) {
		const itemPath = path.join(extensionDir, item);
		if (fs.existsSync(itemPath)) {
			await fs.remove(itemPath);
		}
	}

	// Local's PHP headers reference pcre2.h but don't ship it.
	// Download it into the PHP include directory if missing.
	const pcre2HeaderPath = path.join(symlinkPrefix, 'include', 'php', 'ext', 'pcre', 'pcre2.h');
	if (!fs.existsSync(pcre2HeaderPath)) {
		onLog('Downloading missing pcre2.h header...');
		const pcre2Url = 'https://raw.githubusercontent.com/PCRE2Project/pcre2/pcre2-10.42/src/pcre2.h.generic';
		await downloadFile(pcre2Url, pcre2HeaderPath);
	}

	// All compilation steps run through the user's login shell so that
	// autoconf, make, gcc, etc. are available on PATH.
	// The cd is explicit because login shells may reset the working directory.
	const phpBinDir = path.join(symlinkPrefix, 'bin');
	const shellOpts: ExecOpts = { env, timeout: 300_000 };
	const cdPrefix = `cd "${extensionDir}" && export PATH="${phpBinDir}:$PATH"`;

	onLog('Running phpize...');
	await execInShell(`${cdPrefix} && "${patchedPhpize}"`, shellOpts);

	onLog('Running configure...');
	await execInShell(
		`${cdPrefix} && ./configure --with-php-config="${patchedPhpConfig}"`,
		shellOpts,
	);

	onLog('Running make...');
	await execInShell(`${cdPrefix} && make clean 2>/dev/null; make`, shellOpts);

	// Copy the compiled .so to the version-specific cache directory
	const builtSo = path.join(extensionDir, 'modules', 'xhprof.so');
	const cacheDir = getXhprofCacheDir(phpVersion);
	await fs.ensureDir(cacheDir);
	await fs.copy(builtSo, getXhprofSoPath(phpVersion));

	onLog(`xhprof.so compiled and cached for PHP ${phpVersion}`);
}

/**
 * Copies the compiled xhprof.so from the host cache into Local's PHP
 * extension directory for the site, then adds the extension directive
 * to the site's php.ini.hbs template.
 *
 * Uses Local's `{{extensionsDir}}` Handlebars variable in the ini file
 * so Local resolves the path at runtime. This avoids hardcoding absolute
 * paths that may contain spaces.
 */
export async function installXhprofExtension(
	site: Local.Site,
	phpVersion: string,
	extensionDir: string,
	onLog: (msg: string) => void,
): Promise<void> {
	// Copy .so into Local's extension directory
	const cachedSo = getXhprofSoPath(phpVersion);
	const targetSo = path.join(extensionDir, 'xhprof.so');

	if (!fs.existsSync(targetSo)) {
		await fs.copy(cachedSo, targetSo);
		onLog('Copied xhprof.so to PHP extension directory');
	}

	// Add extension directive to php.ini.hbs using Handlebars template var.
	// Use site.paths.confTemplates (not site.paths.conf) -- this is the
	// template directory that Local processes with Handlebars on site start.
	const phpIniPath = path.join(site.paths.confTemplates, 'php', 'php.ini.hbs');

	if (!fs.existsSync(phpIniPath)) {
		onLog('Warning: php.ini.hbs not found, skipping ini update');
		return;
	}

	const ini = await fs.readFile(phpIniPath, 'utf8');

	if (ini.includes('xhprof.so')) {
		onLog('php.ini.hbs already has xhprof extension');
		return;
	}

	const directive = '\n; xhprof profiling extension (added by WordPress Supercharged)\nextension = {{extensionsDir}}/xhprof.so\n';

	// Insert before [xdebug] section if it exists, otherwise append
	const xdebugIdx = ini.indexOf('[xdebug]');
	let updated: string;
	if (xdebugIdx !== -1) {
		updated = ini.slice(0, xdebugIdx) + directive + ini.slice(xdebugIdx);
	} else {
		updated = ini + directive;
	}

	await fs.writeFile(phpIniPath, updated, 'utf8');
	onLog('Added xhprof extension to php.ini.hbs');
}

/**
 * Verifies that xhprof is properly installed by checking:
 *   1. The .so file exists in the PHP extension directory
 *   2. The php.ini.hbs contains the extension directive
 *
 * We don't run `php -r "phpversion('xhprof')"` because the CLI binary
 * doesn't load the site's processed ini files. The site's PHP-FPM
 * process reads the expanded ini on restart and will load the extension.
 */
export async function verifyXhprofInstalled(
	extensionDir: string,
	site: Local.Site,
): Promise<ToolCheckResult> {
	const soPath = path.join(extensionDir, 'xhprof.so');

	if (!fs.existsSync(soPath)) {
		return { status: 'error', error: 'xhprof.so not found in extension directory' };
	}

	const phpIniPath = path.join(site.paths.confTemplates, 'php', 'php.ini.hbs');
	try {
		const ini = await fs.readFile(phpIniPath, 'utf8');
		if (!ini.includes('xhprof.so')) {
			return { status: 'error', error: 'xhprof not configured in php.ini.hbs' };
		}
	} catch {
		return { status: 'error', error: 'Could not read php.ini.hbs' };
	}

	return { status: 'ready', version: 'installed' };
}

// ---------------------------------------------------------------------------
// mu-plugin functions
// ---------------------------------------------------------------------------

/** Path to the canonical mu-plugin on the host. */
export function getMuPluginDir(): string {
	return path.join(os.homedir(), '.wp-profiler', 'mu-plugin');
}

/** Path to the canonical mu-plugin PHP file. */
export function getMuPluginPath(): string {
	return path.join(getMuPluginDir(), 'wp-profiler-agent.php');
}

/** Path to the mu-plugin source bundled with the addon. */
function getMuPluginSource(): string {
	return path.join(__dirname, 'wp-profiler-agent.php');
}

/**
 * Deploys the profiler mu-plugin:
 * 1. Copies the canonical plugin file to ~/.wp-profiler/mu-plugin/
 * 2. Symlinks it into the site's wp-content/mu-plugins/
 *
 * The canonical copy is always overwritten to ensure the latest version.
 * The symlink is only created if it doesn't already point to the right target.
 */
export async function deployMuPlugin(
	site: Local.Site,
	onLog: (msg: string) => void,
): Promise<void> {
	const canonicalDir = getMuPluginDir();
	const canonicalPath = getMuPluginPath();
	const source = getMuPluginSource();

	// Step 1: Write canonical copy (always overwrite to pick up updates)
	await fs.ensureDir(canonicalDir);
	await fs.copy(source, canonicalPath, { overwrite: true });
	onLog('Profiler agent updated at ~/.wp-profiler/mu-plugin/');

	// Step 2: Symlink into site's mu-plugins directory
	const siteMuPluginsDir = path.join(site.paths.webRoot, 'wp-content', 'mu-plugins');
	await fs.ensureDir(siteMuPluginsDir);

	const symlinkPath = path.join(siteMuPluginsDir, 'wp-profiler-agent.php');

	// Check if symlink already exists and points to the right target
	if (fs.existsSync(symlinkPath)) {
		const stat = await fs.lstat(symlinkPath);
		if (stat.isSymbolicLink()) {
			const target = await fs.readlink(symlinkPath);
			if (target === canonicalPath) {
				onLog('Profiler agent already linked into site');
				return;
			}
			// Wrong target -- remove and recreate
			await fs.remove(symlinkPath);
		} else {
			// It's a regular file, not our symlink -- don't overwrite
			onLog('Warning: wp-profiler-agent.php exists as a regular file, skipping symlink');
			return;
		}
	}

	await fs.ensureSymlink(canonicalPath, symlinkPath);
	onLog('Profiler agent linked into site mu-plugins');
}

/**
 * Checks whether the mu-plugin is deployed for a site.
 */
export function checkMuPluginInstalled(site: Local.Site): boolean {
	const symlinkPath = path.join(site.paths.webRoot, 'wp-content', 'mu-plugins', 'wp-profiler-agent.php');
	return fs.existsSync(symlinkPath);
}

// ---------------------------------------------------------------------------
// CLI deployment
// ---------------------------------------------------------------------------

/** Path to the wp-profiler CLI source bundled with the addon. */
function getCliSource(): string {
	// bin/ is at the addon root, __dirname is lib/features/profiler-setup/
	return path.join(__dirname, '..', '..', '..', 'bin', 'wp-profiler.js');
}

/** Path where the wp-profiler symlink is placed (alongside k6). */
export function getCliSymlinkPath(): string {
	return path.join(os.homedir(), '.local', 'bin', 'wp-profiler');
}

/**
 * Creates a symlink at ~/.local/bin/wp-profiler pointing to the addon's
 * bin/wp-profiler.js so the command is available in Local's site shell.
 */
export async function deployCliCommand(
	onLog: (msg: string) => void,
): Promise<void> {
	const source = getCliSource();
	const symlinkPath = getCliSymlinkPath();

	if (!fs.existsSync(source)) {
		onLog(`Warning: wp-profiler.js not found at ${source}`);
		return;
	}

	await fs.ensureDir(path.dirname(symlinkPath));

	// Check if symlink already exists and points to the right target
	if (fs.existsSync(symlinkPath)) {
		const stat = await fs.lstat(symlinkPath);
		if (stat.isSymbolicLink()) {
			const target = await fs.readlink(symlinkPath);
			if (target === source) {
				onLog('wp-profiler command already available');
				return;
			}
			await fs.remove(symlinkPath);
		} else {
			await fs.remove(symlinkPath);
		}
	}

	await fs.ensureSymlink(source, symlinkPath);
	onLog('wp-profiler command installed at ~/.local/bin/wp-profiler');
}

/**
 * Checks whether the wp-profiler CLI is deployed.
 */
export function checkCliInstalled(): boolean {
	return fs.existsSync(getCliSymlinkPath());
}

// ---------------------------------------------------------------------------
// k6 functions
// ---------------------------------------------------------------------------

/**
 * Returns the k6 download URL for the current platform and architecture.
 * k6 GitHub releases use this naming pattern:
 *   k6-{version}-linux-{arch}.tar.gz
 *   k6-{version}-macos-{arch}.zip
 *   k6-{version}-windows-{arch}.zip
 */
export function getK6DownloadUrl(): string {
	const platform = process.platform;
	const arch = process.arch;

	let osName: string;
	let archName: string;
	let ext: string;

	switch (platform) {
		case 'darwin':
			osName = 'macos';
			ext = 'zip';
			break;
		case 'linux':
			osName = 'linux';
			ext = 'tar.gz';
			break;
		case 'win32':
			osName = 'windows';
			ext = 'zip';
			break;
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}

	switch (arch) {
		case 'arm64':
			archName = 'arm64';
			break;
		case 'x64':
			archName = 'amd64';
			break;
		default:
			throw new Error(`Unsupported architecture: ${arch}`);
	}

	const filename = `k6-${K6_VERSION}-${osName}-${archName}.${ext}`;
	return `https://github.com/grafana/k6/releases/download/${K6_VERSION}/${filename}`;
}

/**
 * Checks whether k6 is installed at the expected path and returns
 * its version string.
 */
export async function checkK6Installed(): Promise<ToolCheckResult> {
	const k6Path = getK6BinPath();

	if (!fs.existsSync(k6Path)) {
		return { status: 'missing' };
	}

	try {
		const output = await execFileAsync(k6Path, ['version']);
		// Output looks like: "k6 v0.54.0 (go1.22.5, ...)"
		const match = output.match(/k6\s+(v[\d.]+)/);
		const version = match ? match[1] : output;
		return { status: 'ready', version };
	} catch (e: any) {
		return { status: 'error', error: e.message };
	}
}

/**
 * Downloads a file from a URL, following redirects. Uses Node's built-in
 * https module so no external dependencies are needed.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
	const https = require('https') as typeof import('https');

	return new Promise<void>((resolve, reject) => {
		const download = (downloadUrl: string, redirectCount: number) => {
			if (redirectCount > 5) {
				reject(new Error('Too many redirects'));
				return;
			}

			https.get(downloadUrl, (res) => {
				if (res.statusCode === 301 || res.statusCode === 302) {
					const location = res.headers.location;
					if (!location) {
						reject(new Error('Redirect with no location header'));
						return;
					}
					res.resume();
					download(location, redirectCount + 1);
					return;
				}

				if (res.statusCode !== 200) {
					reject(new Error(`Download failed with status ${res.statusCode}`));
					return;
				}

				const fileStream = fs.createWriteStream(destPath);
				res.pipe(fileStream);
				fileStream.on('finish', () => {
					fileStream.close();
					resolve();
				});
				fileStream.on('error', reject);
			}).on('error', reject);
		};

		download(url, 0);
	});
}

/**
 * Extracts an archive to a destination directory.
 *
 * Uses OS-appropriate tools:
 *   - Linux (.tar.gz): tar xzf (always available on Linux)
 *   - macOS (.zip): ditto -xk (built-in macOS utility, handles zip natively)
 *   - Windows (.zip): PowerShell Expand-Archive (built-in on Windows 5.1+)
 */
async function extractArchive(
	archivePath: string,
	destDir: string,
): Promise<void> {
	const platform = process.platform;

	if (platform === 'linux') {
		await execFileAsync('tar', ['xzf', archivePath, '-C', destDir]);
	} else if (platform === 'darwin') {
		await execFileAsync('ditto', ['-xk', archivePath, destDir]);
	} else if (platform === 'win32') {
		await execFileAsync('powershell', [
			'-NoProfile', '-Command',
			`Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${destDir}'`,
		]);
	} else {
		throw new Error(`Unsupported platform for extraction: ${platform}`);
	}
}

/**
 * Downloads the k6 binary from GitHub releases, extracts it, and
 * places it in ~/.local/bin/.
 *
 * Archive formats per platform:
 *   - Linux: .tar.gz
 *   - macOS: .zip
 *   - Windows: .zip
 */
export async function downloadAndInstallK6(
	onLog: (msg: string) => void,
): Promise<void> {
	const url = getK6DownloadUrl();
	const binDir = path.dirname(getK6BinPath());
	const isWindows = process.platform === 'win32';
	const isLinux = process.platform === 'linux';
	const ext = isLinux ? 'tar.gz' : 'zip';
	const tempDir = path.join(os.homedir(), '.wp-profiler-cache');
	const tempFile = path.join(tempDir, `k6-download.${ext}`);

	await fs.ensureDir(binDir);
	await fs.ensureDir(tempDir);

	onLog(`Downloading k6 ${K6_VERSION}...`);
	await downloadFile(url, tempFile);

	onLog('Extracting k6...');
	await extractArchive(tempFile, tempDir);

	// The archive extracts to a directory like k6-v0.54.0-macos-arm64/k6
	const archiveName = `k6-${K6_VERSION}-${getK6PlatformArch()}`;
	const extractedDir = path.join(tempDir, archiveName);
	const binName = isWindows ? 'k6.exe' : 'k6';
	const extractedBin = path.join(extractedDir, binName);

	// Find the binary -- try the expected path first, then search
	const sourceBin = fs.existsSync(extractedBin)
		? extractedBin
		: await findExtractedK6(tempDir, isWindows);

	await fs.move(sourceBin, getK6BinPath(), { overwrite: true });

	// Set executable permission on macOS/Linux
	if (!isWindows) {
		fs.chmodSync(getK6BinPath(), 0o755);
	}

	// Cleanup temp files
	await fs.remove(tempFile);
	if (fs.existsSync(extractedDir)) {
		await fs.remove(extractedDir);
	}

	onLog('k6 installed');
}

/**
 * Returns the platform-arch string used in k6 release archive names.
 */
function getK6PlatformArch(): string {
	const platform = process.platform;
	const arch = process.arch;

	const osName = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux';
	const archName = arch === 'arm64' ? 'arm64' : 'amd64';

	return `${osName}-${archName}`;
}

/**
 * Finds the k6 binary within extracted archive contents.
 * The archive typically extracts to a directory named k6-{version}-{os}-{arch}/.
 */
async function findExtractedK6(
	searchDir: string,
	isWindows: boolean,
): Promise<string> {
	const binName = isWindows ? 'k6.exe' : 'k6';
	const entries = await fs.readdir(searchDir);

	for (const entry of entries) {
		const entryPath = path.join(searchDir, entry);
		const stat = await fs.stat(entryPath);

		if (stat.isDirectory()) {
			const candidate = path.join(entryPath, binName);
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		}

		if (entry === binName) {
			return entryPath;
		}
	}

	throw new Error(`Could not find ${binName} in extracted archive`);
}

// ---------------------------------------------------------------------------
// Status aggregation
// ---------------------------------------------------------------------------

/**
 * Checks the installation status of all profiler tools and returns
 * an aggregate status object.
 */
export async function getProfilerStatus(
	extensionDir: string | null,
	site: Local.Site,
	phpVersion: string,
): Promise<ProfilerSetupStatus> {
	let xhprofStatus: ToolCheckResult;

	if (!extensionDir) {
		xhprofStatus = { status: 'error', error: 'PHP extension directory not found' };
	} else if (checkXhprofCached(phpVersion)) {
		xhprofStatus = await verifyXhprofInstalled(extensionDir, site);
	} else {
		xhprofStatus = { status: 'missing' };
	}

	const k6Status = await checkK6Installed();

	const muPluginStatus: ToolCheckResult = checkMuPluginInstalled(site)
		? { status: 'ready', version: 'installed' }
		: { status: 'missing' };

	return { xhprof: xhprofStatus, k6: k6Status, muPlugin: muPluginStatus };
}

// ---------------------------------------------------------------------------
// Cache helpers (same pattern as ngrok.service.ts)
// ---------------------------------------------------------------------------

/**
 * Reads the cached profiler state from the SiteJSON object.
 */
export function readProfilerCache(site: Local.Site): ProfilerCache | undefined {
	const cache = (site as any).superchargedAddon as SuperchargedCache | undefined;
	return cache?.profiler;
}

/**
 * Persists the profiler state onto the SiteJSON object. Existing
 * fields on superchargedAddon (e.g. debugConstants, ngrok) are preserved.
 */
export function writeProfilerCache(
	siteData: LocalMain.Services.SiteDataService,
	siteId: string,
	profiler: ProfilerCache,
): void {
	const site = siteData.getSite(siteId);
	const existing = (site as any)?.superchargedAddon || {};

	siteData.updateSite(siteId, {
		id: siteId,
		superchargedAddon: {
			...existing,
			profiler,
		},
	} as Partial<Local.SiteJSON>);
}
