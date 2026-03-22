"use strict";
/**
 * profiler-setup.service.ts -- Pure functions for checking, installing, and
 * verifying profiler tooling (xhprof PHP extension and k6 load test binary).
 *
 * All functions are stateless and take their dependencies as arguments,
 * making them independently testable and reusable from any context.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeProfilerCache = exports.readProfilerCache = exports.getProfilerStatus = exports.downloadAndInstallK6 = exports.checkK6Installed = exports.getK6DownloadUrl = exports.checkCliInstalled = exports.deployCliCommand = exports.getCliSymlinkPath = exports.checkMuPluginInstalled = exports.deployMuPlugin = exports.getMuPluginPath = exports.getMuPluginDir = exports.verifyXhprofInstalled = exports.installXhprofExtension = exports.compileXhprof = exports.ensureXhprofSource = exports.checkXhprofCached = exports.findExtensionDir = exports.getPhpConfDPath = exports.getK6BinPath = exports.getXhprofSrcDir = exports.getXhprofSoPath = exports.getXhprofCacheDir = exports.XHPROF_REPO = exports.K6_VERSION = void 0;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
const child_process_1 = require("child_process");
/** Pinned k6 version for reproducible installs. */
exports.K6_VERSION = 'v0.54.0';
/** GitHub repo URL for the xhprof extension source. */
exports.XHPROF_REPO = 'https://github.com/longxinH/xhprof.git';
// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------
/**
 * Returns the base directory for xhprof compiled .so caches.
 * Layout: ~/.wp-profiler-cache/xhprof/{phpVersion}/xhprof.so
 */
function getXhprofCacheDir(phpVersion) {
    return path.join(os.homedir(), '.wp-profiler-cache', 'xhprof', phpVersion);
}
exports.getXhprofCacheDir = getXhprofCacheDir;
/** Returns the full path to the cached xhprof.so for a PHP version. */
function getXhprofSoPath(phpVersion) {
    return path.join(getXhprofCacheDir(phpVersion), 'xhprof.so');
}
exports.getXhprofSoPath = getXhprofSoPath;
/** Returns the directory where the xhprof source repo is cloned. */
function getXhprofSrcDir() {
    return path.join(os.homedir(), '.wp-profiler-cache', 'xhprof', 'src');
}
exports.getXhprofSrcDir = getXhprofSrcDir;
/** Returns the path to the k6 binary on the host. */
function getK6BinPath() {
    const name = process.platform === 'win32' ? 'k6.exe' : 'k6';
    return path.join(os.homedir(), '.local', 'bin', name);
}
exports.getK6BinPath = getK6BinPath;
/**
 * Returns the PHP conf.d directory for a site, where per-site ini
 * snippets are placed so the PHP process picks them up on start.
 */
function getPhpConfDPath(site) {
    return path.join(site.paths.conf, 'php', 'conf.d');
}
exports.getPhpConfDPath = getPhpConfDPath;
/**
 * Promise wrapper around child_process.execFile.
 * Always uses argument arrays -- never shell strings.
 */
function execFileAsync(command, args, opts = {}) {
    return new Promise((resolve, reject) => {
        var _a;
        (0, child_process_1.execFile)(command, args, {
            cwd: opts.cwd,
            env: opts.env,
            timeout: (_a = opts.timeout) !== null && _a !== void 0 ? _a : 120000,
            maxBuffer: 10 * 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error) {
                const msg = (stderr === null || stderr === void 0 ? void 0 : stderr.trim()) || error.message;
                reject(new Error(msg));
            }
            else {
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
function execInShell(command, opts = {}) {
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
function findExtensionDir(phpPrefix) {
    return __awaiter(this, void 0, void 0, function* () {
        const extBase = path.join(phpPrefix, 'lib', 'php', 'extensions');
        try {
            const entries = yield fs.readdir(extBase);
            const ntsDir = entries.find((e) => e.startsWith('no-debug-non-zts-'));
            if (!ntsDir)
                return null;
            return path.join(extBase, ntsDir);
        }
        catch (_a) {
            return null;
        }
    });
}
exports.findExtensionDir = findExtensionDir;
/**
 * Checks whether a compiled xhprof.so exists in the host cache
 * for the given PHP version.
 */
function checkXhprofCached(phpVersion) {
    return fs.existsSync(getXhprofSoPath(phpVersion));
}
exports.checkXhprofCached = checkXhprofCached;
/**
 * Clones the xhprof source repo into the host cache if not already present.
 * Skips the clone if the extension/ subdirectory already exists.
 */
function ensureXhprofSource(onLog) {
    return __awaiter(this, void 0, void 0, function* () {
        const srcDir = getXhprofSrcDir();
        const extensionDir = path.join(srcDir, 'extension');
        if (fs.existsSync(extensionDir)) {
            onLog('xhprof source code found locally');
            return;
        }
        onLog('Cloning xhprof source...');
        yield fs.ensureDir(path.dirname(srcDir));
        yield execFileAsync('git', ['clone', '--depth', '1', exports.XHPROF_REPO, srcDir]);
        onLog('xhprof source cloned');
    });
}
exports.ensureXhprofSource = ensureXhprofSource;
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
function patchPhpScript(scriptPath, symlinkPrefix, patchDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const content = yield fs.readFile(scriptPath, 'utf8');
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
        yield fs.writeFile(patchedPath, patched);
        fs.chmodSync(patchedPath, 0o755);
        return patchedPath;
    });
}
/**
 * Creates a symlink at a space-free path pointing to the PHP install
 * directory. phpize and the configure script reject paths with spaces,
 * so this symlink provides a clean path for compilation.
 *
 * @returns The space-free symlink path.
 */
function ensureSpaceFreePhpLink(phpPrefix, phpVersion) {
    return __awaiter(this, void 0, void 0, function* () {
        const linkPath = path.join(os.homedir(), '.wp-profiler-cache', `php-${phpVersion.replace(/[^a-zA-Z0-9._-]/g, '_')}-link`);
        // Remove existing symlink if it points to the wrong target
        if (fs.existsSync(linkPath)) {
            const existing = yield fs.readlink(linkPath).catch(() => null);
            if (existing === phpPrefix) {
                return linkPath;
            }
            yield fs.remove(linkPath);
        }
        yield fs.ensureSymlink(phpPrefix, linkPath);
        return linkPath;
    });
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
function compileXhprof(phpVersion, phpizeBin, phpConfigBin, env, onLog) {
    return __awaiter(this, void 0, void 0, function* () {
        const extensionDir = path.join(getXhprofSrcDir(), 'extension');
        // The actual PHP prefix is the directory two levels above bin/phpize
        const actualPrefix = path.dirname(path.dirname(phpizeBin));
        onLog(`Compiling xhprof for PHP ${phpVersion}...`);
        // Create a space-free symlink to the PHP directory
        const symlinkPrefix = yield ensureSpaceFreePhpLink(actualPrefix, phpVersion);
        // Create a temp directory for patched scripts
        const patchDir = path.join(os.homedir(), '.wp-profiler-cache', 'patched-php-tools');
        yield fs.ensureDir(patchDir);
        // Patch phpize and php-config to use the symlink prefix
        onLog('Patching PHP build tools...');
        const patchedPhpize = yield patchPhpScript(phpizeBin, symlinkPrefix, patchDir);
        const patchedPhpConfig = yield patchPhpScript(phpConfigBin, symlinkPrefix, patchDir);
        // Clean stale build artifacts from any previous failed compilation.
        // Never delete config.m4 (part of xhprof source, needed by phpize).
        const staleItems = ['configure', 'configure.ac', 'build', 'autom4te.cache',
            'config.h.in', 'config.h', 'config.log', 'config.status',
            'Makefile', '.libs', 'modules', 'acinclude.m4', 'aclocal.m4',
            'run-tests.php', 'mkinstalldirs', 'install-sh'];
        for (const item of staleItems) {
            const itemPath = path.join(extensionDir, item);
            if (fs.existsSync(itemPath)) {
                yield fs.remove(itemPath);
            }
        }
        // Local's PHP headers reference pcre2.h but don't ship it.
        // Download it into the PHP include directory if missing.
        const pcre2HeaderPath = path.join(symlinkPrefix, 'include', 'php', 'ext', 'pcre', 'pcre2.h');
        if (!fs.existsSync(pcre2HeaderPath)) {
            onLog('Downloading missing pcre2.h header...');
            const pcre2Url = 'https://raw.githubusercontent.com/PCRE2Project/pcre2/pcre2-10.42/src/pcre2.h.generic';
            yield downloadFile(pcre2Url, pcre2HeaderPath);
        }
        // All compilation steps run through the user's login shell so that
        // autoconf, make, gcc, etc. are available on PATH.
        // The cd is explicit because login shells may reset the working directory.
        const phpBinDir = path.join(symlinkPrefix, 'bin');
        const shellOpts = { env, timeout: 300000 };
        const cdPrefix = `cd "${extensionDir}" && export PATH="${phpBinDir}:$PATH"`;
        onLog('Running phpize...');
        yield execInShell(`${cdPrefix} && "${patchedPhpize}"`, shellOpts);
        onLog('Running configure...');
        yield execInShell(`${cdPrefix} && ./configure --with-php-config="${patchedPhpConfig}"`, shellOpts);
        onLog('Running make...');
        yield execInShell(`${cdPrefix} && make clean 2>/dev/null; make`, shellOpts);
        // Copy the compiled .so to the version-specific cache directory
        const builtSo = path.join(extensionDir, 'modules', 'xhprof.so');
        const cacheDir = getXhprofCacheDir(phpVersion);
        yield fs.ensureDir(cacheDir);
        yield fs.copy(builtSo, getXhprofSoPath(phpVersion));
        onLog(`xhprof.so compiled and cached for PHP ${phpVersion}`);
    });
}
exports.compileXhprof = compileXhprof;
/**
 * Copies the compiled xhprof.so from the host cache into Local's PHP
 * extension directory for the site, then adds the extension directive
 * to the site's php.ini.hbs template.
 *
 * Uses Local's `{{extensionsDir}}` Handlebars variable in the ini file
 * so Local resolves the path at runtime. This avoids hardcoding absolute
 * paths that may contain spaces.
 */
function installXhprofExtension(site, phpVersion, extensionDir, onLog) {
    return __awaiter(this, void 0, void 0, function* () {
        // Copy .so into Local's extension directory
        const cachedSo = getXhprofSoPath(phpVersion);
        const targetSo = path.join(extensionDir, 'xhprof.so');
        if (!fs.existsSync(targetSo)) {
            yield fs.copy(cachedSo, targetSo);
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
        const ini = yield fs.readFile(phpIniPath, 'utf8');
        if (ini.includes('xhprof.so')) {
            onLog('php.ini.hbs already has xhprof extension');
            return;
        }
        const directive = '\n; xhprof profiling extension (added by WordPress Supercharged)\nextension = {{extensionsDir}}/xhprof.so\n';
        // Insert before [xdebug] section if it exists, otherwise append
        const xdebugIdx = ini.indexOf('[xdebug]');
        let updated;
        if (xdebugIdx !== -1) {
            updated = ini.slice(0, xdebugIdx) + directive + ini.slice(xdebugIdx);
        }
        else {
            updated = ini + directive;
        }
        yield fs.writeFile(phpIniPath, updated, 'utf8');
        onLog('Added xhprof extension to php.ini.hbs');
    });
}
exports.installXhprofExtension = installXhprofExtension;
/**
 * Verifies that xhprof is properly installed by checking:
 *   1. The .so file exists in the PHP extension directory
 *   2. The php.ini.hbs contains the extension directive
 *
 * We don't run `php -r "phpversion('xhprof')"` because the CLI binary
 * doesn't load the site's processed ini files. The site's PHP-FPM
 * process reads the expanded ini on restart and will load the extension.
 */
function verifyXhprofInstalled(extensionDir, site) {
    return __awaiter(this, void 0, void 0, function* () {
        const soPath = path.join(extensionDir, 'xhprof.so');
        if (!fs.existsSync(soPath)) {
            return { status: 'error', error: 'xhprof.so not found in extension directory' };
        }
        const phpIniPath = path.join(site.paths.confTemplates, 'php', 'php.ini.hbs');
        try {
            const ini = yield fs.readFile(phpIniPath, 'utf8');
            if (!ini.includes('xhprof.so')) {
                return { status: 'error', error: 'xhprof not configured in php.ini.hbs' };
            }
        }
        catch (_a) {
            return { status: 'error', error: 'Could not read php.ini.hbs' };
        }
        return { status: 'ready', version: 'installed' };
    });
}
exports.verifyXhprofInstalled = verifyXhprofInstalled;
// ---------------------------------------------------------------------------
// mu-plugin functions
// ---------------------------------------------------------------------------
/** Path to the canonical mu-plugin on the host. */
function getMuPluginDir() {
    return path.join(os.homedir(), '.wp-profiler', 'mu-plugin');
}
exports.getMuPluginDir = getMuPluginDir;
/** Path to the canonical mu-plugin PHP file. */
function getMuPluginPath() {
    return path.join(getMuPluginDir(), 'wp-profiler-agent.php');
}
exports.getMuPluginPath = getMuPluginPath;
/** Path to the mu-plugin source bundled with the addon. */
function getMuPluginSource() {
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
function deployMuPlugin(site, onLog) {
    return __awaiter(this, void 0, void 0, function* () {
        const canonicalDir = getMuPluginDir();
        const canonicalPath = getMuPluginPath();
        const source = getMuPluginSource();
        // Step 1: Write canonical copy (always overwrite to pick up updates)
        yield fs.ensureDir(canonicalDir);
        yield fs.copy(source, canonicalPath, { overwrite: true });
        onLog('Profiler agent updated at ~/.wp-profiler/mu-plugin/');
        // Step 2: Symlink into site's mu-plugins directory
        const siteMuPluginsDir = path.join(site.paths.webRoot, 'wp-content', 'mu-plugins');
        yield fs.ensureDir(siteMuPluginsDir);
        const symlinkPath = path.join(siteMuPluginsDir, 'wp-profiler-agent.php');
        // Check if symlink already exists and points to the right target
        if (fs.existsSync(symlinkPath)) {
            const stat = yield fs.lstat(symlinkPath);
            if (stat.isSymbolicLink()) {
                const target = yield fs.readlink(symlinkPath);
                if (target === canonicalPath) {
                    onLog('Profiler agent already linked into site');
                    return;
                }
                // Wrong target -- remove and recreate
                yield fs.remove(symlinkPath);
            }
            else {
                // It's a regular file, not our symlink -- don't overwrite
                onLog('Warning: wp-profiler-agent.php exists as a regular file, skipping symlink');
                return;
            }
        }
        yield fs.ensureSymlink(canonicalPath, symlinkPath);
        onLog('Profiler agent linked into site mu-plugins');
    });
}
exports.deployMuPlugin = deployMuPlugin;
/**
 * Checks whether the mu-plugin is deployed for a site.
 */
function checkMuPluginInstalled(site) {
    const symlinkPath = path.join(site.paths.webRoot, 'wp-content', 'mu-plugins', 'wp-profiler-agent.php');
    return fs.existsSync(symlinkPath);
}
exports.checkMuPluginInstalled = checkMuPluginInstalled;
// ---------------------------------------------------------------------------
// CLI deployment
// ---------------------------------------------------------------------------
/** Path to the wp-profiler CLI source bundled with the addon. */
function getCliSource() {
    // bin/ is at the addon root, __dirname is lib/features/profiler-setup/
    return path.join(__dirname, '..', '..', '..', 'bin', 'wp-profiler.js');
}
/** Path where the wp-profiler symlink is placed (alongside k6). */
function getCliSymlinkPath() {
    return path.join(os.homedir(), '.local', 'bin', 'wp-profiler');
}
exports.getCliSymlinkPath = getCliSymlinkPath;
/**
 * Creates a symlink at ~/.local/bin/wp-profiler pointing to the addon's
 * bin/wp-profiler.js so the command is available in Local's site shell.
 */
function deployCliCommand(onLog) {
    return __awaiter(this, void 0, void 0, function* () {
        const source = getCliSource();
        const symlinkPath = getCliSymlinkPath();
        if (!fs.existsSync(source)) {
            onLog(`Warning: wp-profiler.js not found at ${source}`);
            return;
        }
        yield fs.ensureDir(path.dirname(symlinkPath));
        // Check if symlink already exists and points to the right target
        if (fs.existsSync(symlinkPath)) {
            const stat = yield fs.lstat(symlinkPath);
            if (stat.isSymbolicLink()) {
                const target = yield fs.readlink(symlinkPath);
                if (target === source) {
                    onLog('wp-profiler command already available');
                    return;
                }
                yield fs.remove(symlinkPath);
            }
            else {
                yield fs.remove(symlinkPath);
            }
        }
        yield fs.ensureSymlink(source, symlinkPath);
        onLog('wp-profiler command installed at ~/.local/bin/wp-profiler');
    });
}
exports.deployCliCommand = deployCliCommand;
/**
 * Checks whether the wp-profiler CLI is deployed.
 */
function checkCliInstalled() {
    return fs.existsSync(getCliSymlinkPath());
}
exports.checkCliInstalled = checkCliInstalled;
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
function getK6DownloadUrl() {
    const platform = process.platform;
    const arch = process.arch;
    let osName;
    let archName;
    let ext;
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
    const filename = `k6-${exports.K6_VERSION}-${osName}-${archName}.${ext}`;
    return `https://github.com/grafana/k6/releases/download/${exports.K6_VERSION}/${filename}`;
}
exports.getK6DownloadUrl = getK6DownloadUrl;
/**
 * Checks whether k6 is installed at the expected path and returns
 * its version string.
 */
function checkK6Installed() {
    return __awaiter(this, void 0, void 0, function* () {
        const k6Path = getK6BinPath();
        if (!fs.existsSync(k6Path)) {
            return { status: 'missing' };
        }
        try {
            const output = yield execFileAsync(k6Path, ['version']);
            // Output looks like: "k6 v0.54.0 (go1.22.5, ...)"
            const match = output.match(/k6\s+(v[\d.]+)/);
            const version = match ? match[1] : output;
            return { status: 'ready', version };
        }
        catch (e) {
            return { status: 'error', error: e.message };
        }
    });
}
exports.checkK6Installed = checkK6Installed;
/**
 * Downloads a file from a URL, following redirects. Uses Node's built-in
 * https module so no external dependencies are needed.
 */
function downloadFile(url, destPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const https = require('https');
        return new Promise((resolve, reject) => {
            const download = (downloadUrl, redirectCount) => {
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
function extractArchive(archivePath, destDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const platform = process.platform;
        if (platform === 'linux') {
            yield execFileAsync('tar', ['xzf', archivePath, '-C', destDir]);
        }
        else if (platform === 'darwin') {
            yield execFileAsync('ditto', ['-xk', archivePath, destDir]);
        }
        else if (platform === 'win32') {
            yield execFileAsync('powershell', [
                '-NoProfile', '-Command',
                `Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${destDir}'`,
            ]);
        }
        else {
            throw new Error(`Unsupported platform for extraction: ${platform}`);
        }
    });
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
function downloadAndInstallK6(onLog) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = getK6DownloadUrl();
        const binDir = path.dirname(getK6BinPath());
        const isWindows = process.platform === 'win32';
        const isLinux = process.platform === 'linux';
        const ext = isLinux ? 'tar.gz' : 'zip';
        const tempDir = path.join(os.homedir(), '.wp-profiler-cache');
        const tempFile = path.join(tempDir, `k6-download.${ext}`);
        yield fs.ensureDir(binDir);
        yield fs.ensureDir(tempDir);
        onLog(`Downloading k6 ${exports.K6_VERSION}...`);
        yield downloadFile(url, tempFile);
        onLog('Extracting k6...');
        yield extractArchive(tempFile, tempDir);
        // The archive extracts to a directory like k6-v0.54.0-macos-arm64/k6
        const archiveName = `k6-${exports.K6_VERSION}-${getK6PlatformArch()}`;
        const extractedDir = path.join(tempDir, archiveName);
        const binName = isWindows ? 'k6.exe' : 'k6';
        const extractedBin = path.join(extractedDir, binName);
        // Find the binary -- try the expected path first, then search
        const sourceBin = fs.existsSync(extractedBin)
            ? extractedBin
            : yield findExtractedK6(tempDir, isWindows);
        yield fs.move(sourceBin, getK6BinPath(), { overwrite: true });
        // Set executable permission on macOS/Linux
        if (!isWindows) {
            fs.chmodSync(getK6BinPath(), 0o755);
        }
        // Cleanup temp files
        yield fs.remove(tempFile);
        if (fs.existsSync(extractedDir)) {
            yield fs.remove(extractedDir);
        }
        onLog('k6 installed');
    });
}
exports.downloadAndInstallK6 = downloadAndInstallK6;
/**
 * Returns the platform-arch string used in k6 release archive names.
 */
function getK6PlatformArch() {
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
function findExtractedK6(searchDir, isWindows) {
    return __awaiter(this, void 0, void 0, function* () {
        const binName = isWindows ? 'k6.exe' : 'k6';
        const entries = yield fs.readdir(searchDir);
        for (const entry of entries) {
            const entryPath = path.join(searchDir, entry);
            const stat = yield fs.stat(entryPath);
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
    });
}
// ---------------------------------------------------------------------------
// Status aggregation
// ---------------------------------------------------------------------------
/**
 * Checks the installation status of all profiler tools and returns
 * an aggregate status object.
 */
function getProfilerStatus(extensionDir, site, phpVersion) {
    return __awaiter(this, void 0, void 0, function* () {
        let xhprofStatus;
        if (!extensionDir) {
            xhprofStatus = { status: 'error', error: 'PHP extension directory not found' };
        }
        else if (checkXhprofCached(phpVersion)) {
            xhprofStatus = yield verifyXhprofInstalled(extensionDir, site);
        }
        else {
            xhprofStatus = { status: 'missing' };
        }
        const k6Status = yield checkK6Installed();
        const muPluginStatus = checkMuPluginInstalled(site)
            ? { status: 'ready', version: 'installed' }
            : { status: 'missing' };
        return { xhprof: xhprofStatus, k6: k6Status, muPlugin: muPluginStatus };
    });
}
exports.getProfilerStatus = getProfilerStatus;
// ---------------------------------------------------------------------------
// Cache helpers (same pattern as ngrok.service.ts)
// ---------------------------------------------------------------------------
/**
 * Reads the cached profiler state from the SiteJSON object.
 */
function readProfilerCache(site) {
    const cache = site.superchargedAddon;
    return cache === null || cache === void 0 ? void 0 : cache.profiler;
}
exports.readProfilerCache = readProfilerCache;
/**
 * Persists the profiler state onto the SiteJSON object. Existing
 * fields on superchargedAddon (e.g. debugConstants, ngrok) are preserved.
 */
function writeProfilerCache(siteData, siteId, profiler) {
    const site = siteData.getSite(siteId);
    const existing = (site === null || site === void 0 ? void 0 : site.superchargedAddon) || {};
    siteData.updateSite(siteId, {
        id: siteId,
        superchargedAddon: Object.assign(Object.assign({}, existing), { profiler }),
    });
}
exports.writeProfilerCache = writeProfilerCache;
//# sourceMappingURL=profiler-setup.service.js.map