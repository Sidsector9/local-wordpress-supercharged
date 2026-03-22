import 'jest-extended';
import * as path from 'path';
import * as os from 'os';

import {
	getXhprofCacheDir,
	getXhprofSoPath,
	getXhprofSrcDir,
	getK6BinPath,
	findExtensionDir,
	checkXhprofCached,
	ensureXhprofSource,
	compileXhprof,
	installXhprofExtension,
	verifyXhprofInstalled,
	getK6DownloadUrl,
	checkK6Installed,
	getProfilerStatus,
	readProfilerCache,
	writeProfilerCache,
	K6_VERSION,
} from './profiler-setup.service';
import { createMockSite, createMockSiteData } from '../../test/mockCreators';

jest.mock('fs-extra');
jest.mock('child_process');

const fsExtra = require('fs-extra') as jest.Mocked<typeof import('fs-extra')>;
const childProcess = require('child_process') as jest.Mocked<typeof import('child_process')>;

beforeEach(() => {
	jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

describe('getXhprofCacheDir', () => {
	it('returns a path under homedir with the PHP version', () => {
		const result = getXhprofCacheDir('8.2.0');
		expect(result).toBe(path.join(os.homedir(), '.wp-profiler-cache', 'xhprof', '8.2.0'));
	});
});

describe('getXhprofSoPath', () => {
	it('returns xhprof.so path within the version cache dir', () => {
		const result = getXhprofSoPath('8.1.0');
		expect(result).toBe(path.join(os.homedir(), '.wp-profiler-cache', 'xhprof', '8.1.0', 'xhprof.so'));
	});
});

describe('getXhprofSrcDir', () => {
	it('returns the src directory path', () => {
		expect(getXhprofSrcDir()).toBe(
			path.join(os.homedir(), '.wp-profiler-cache', 'xhprof', 'src'),
		);
	});
});

describe('getK6BinPath', () => {
	it('returns path under ~/.local/bin', () => {
		const result = getK6BinPath();
		const expected = process.platform === 'win32'
			? path.join(os.homedir(), '.local', 'bin', 'k6.exe')
			: path.join(os.homedir(), '.local', 'bin', 'k6');
		expect(result).toBe(expected);
	});
});

describe('findExtensionDir', () => {
	it('returns the no-debug-non-zts directory', async () => {
		fsExtra.readdir.mockResolvedValue(['no-debug-non-zts-20220829'] as any);
		const result = await findExtensionDir('/opt/php');
		expect(result).toBe('/opt/php/lib/php/extensions/no-debug-non-zts-20220829');
	});

	it('returns null when directory not found', async () => {
		fsExtra.readdir.mockRejectedValue(new Error('ENOENT') as any);
		const result = await findExtensionDir('/opt/php');
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// xhprof functions
// ---------------------------------------------------------------------------

describe('checkXhprofCached', () => {
	it('returns true when .so file exists', () => {
		fsExtra.existsSync.mockReturnValue(true);
		expect(checkXhprofCached('8.2.0')).toBe(true);
		expect(fsExtra.existsSync).toHaveBeenCalledWith(getXhprofSoPath('8.2.0'));
	});

	it('returns false when .so file does not exist', () => {
		fsExtra.existsSync.mockReturnValue(false);
		expect(checkXhprofCached('8.2.0')).toBe(false);
	});
});

describe('ensureXhprofSource', () => {
	it('skips clone when extension dir already exists', async () => {
		fsExtra.existsSync.mockReturnValue(true);
		const onLog = jest.fn();

		await ensureXhprofSource(onLog);

		expect(onLog).toHaveBeenCalledWith(expect.stringContaining('found locally'));
		expect(childProcess.execFile).not.toHaveBeenCalled();
	});

	it('clones the repo when extension dir does not exist', async () => {
		fsExtra.existsSync.mockReturnValue(false);
		fsExtra.ensureDir.mockResolvedValue(undefined as any);
		childProcess.execFile.mockImplementation(
			(_cmd: any, _args: any, _opts: any, cb: any) => {
				if (typeof cb === 'function') cb(null, '', '');
				return {} as any;
			},
		);
		const onLog = jest.fn();

		await ensureXhprofSource(onLog);

		expect(onLog).toHaveBeenCalledWith('Cloning xhprof source...');
		expect(childProcess.execFile).toHaveBeenCalledWith(
			'git',
			['clone', '--depth', '1', expect.stringContaining('xhprof'), expect.any(String)],
			expect.any(Object),
			expect.any(Function),
		);
	});
});

describe('compileXhprof', () => {
	const phpVersion = '8.2.0';
	const phpizeBin = '/opt/php/bin/phpize';
	const phpConfigBin = '/opt/php/bin/php-config';
	const env = { PATH: '/opt/php/bin' };
	const onLog = jest.fn();

	beforeEach(() => {
		childProcess.execFile.mockImplementation(
			(_cmd: any, _args: any, _opts: any, cb: any) => {
				if (typeof cb === 'function') cb(null, '', '');
				return {} as any;
			},
		);
		fsExtra.ensureDir.mockResolvedValue(undefined as any);
		fsExtra.copy.mockResolvedValue(undefined as any);
		// Mock readFile to return a phpize/php-config script with a prefix line
		fsExtra.readFile.mockResolvedValue("prefix='/Users/distiller/project/php/8.2.0/bin/darwin-arm64'\n" as any);
		fsExtra.writeFile.mockResolvedValue(undefined as any);
		// Mock symlink creation and pcre2.h existence check
		fsExtra.existsSync.mockImplementation((p: string) => {
			// pcre2.h exists so download is skipped
			if (typeof p === 'string' && p.includes('pcre2.h')) return true;
			return false;
		});
		fsExtra.ensureSymlink.mockResolvedValue(undefined as any);
		fsExtra.readlink.mockRejectedValue(new Error('not a link') as any);
	});

	it('runs phpize, configure, and make via login shell', async () => {
		await compileXhprof(phpVersion, phpizeBin, phpConfigBin, env, onLog);

		// All compilation steps run through the login shell
		const execCalls = childProcess.execFile.mock.calls;
		const shell = process.env.SHELL || '/bin/sh';

		// Each call should go through the shell with -l -c
		const shellCalls = execCalls.filter((c: any[]) => c[0] === shell);
		expect(shellCalls.length).toBeGreaterThanOrEqual(3);

		// Verify phpize, configure, and make are in the shell commands
		const commands = shellCalls.map((c: any[]) => c[1][2]);
		expect(commands[0]).toContain('phpize');
		expect(commands[1]).toContain('configure');
		expect(commands[2]).toContain('make');
	});

	it('copies the .so to the cache directory', async () => {
		await compileXhprof(phpVersion, phpizeBin, phpConfigBin, env, onLog);

		expect(fsExtra.copy).toHaveBeenCalledWith(
			expect.stringContaining('modules/xhprof.so'),
			getXhprofSoPath(phpVersion),
		);
	});
});

describe('installXhprofExtension', () => {
	it('copies .so and updates php.ini.hbs', async () => {
		fsExtra.existsSync.mockImplementation((p: string) => {
			if (typeof p === 'string' && p.includes('xhprof.so')) return true; // cached .so exists
			if (typeof p === 'string' && p.includes('php.ini.hbs')) return true;
			return false;
		});
		fsExtra.copy.mockResolvedValue(undefined as any);
		fsExtra.readFile.mockResolvedValue('[PHP]\nextension=opcache.so\n' as any);
		fsExtra.writeFile.mockResolvedValue(undefined as any);
		const onLog = jest.fn();

		const site = createMockSite({ conf: '/sites/test/conf' });
		await installXhprofExtension(site, '8.2.0', '/ext/dir', onLog);

		// Should write php.ini.hbs with {{extensionsDir}} template variable
		const writeCall = fsExtra.writeFile.mock.calls.find(
			(c: any[]) => typeof c[0] === 'string' && c[0].includes('php.ini.hbs'),
		);
		expect(writeCall).toBeDefined();
		expect(writeCall[1]).toContain('{{extensionsDir}}/xhprof.so');
	});

	it('skips if xhprof already in php.ini.hbs', async () => {
		fsExtra.existsSync.mockReturnValue(true);
		fsExtra.readFile.mockResolvedValue('extension = {{extensionsDir}}/xhprof.so\n' as any);
		const onLog = jest.fn();

		const site = createMockSite({ conf: '/sites/test/conf' });
		await installXhprofExtension(site, '8.2.0', '/ext/dir', onLog);

		expect(onLog).toHaveBeenCalledWith(expect.stringContaining('already has xhprof'));
	});
});

describe('verifyXhprofInstalled', () => {
	it('returns ready when .so exists and ini is configured', async () => {
		fsExtra.existsSync.mockReturnValue(true);
		fsExtra.readFile.mockResolvedValue('extension = {{extensionsDir}}/xhprof.so\n' as any);

		const site = createMockSite({ conf: '/sites/test/conf' });
		const result = await verifyXhprofInstalled('/ext/dir', site);
		expect(result.status).toBe('ready');
	});

	it('returns error when .so is missing', async () => {
		fsExtra.existsSync.mockReturnValue(false);

		const site = createMockSite({ conf: '/sites/test/conf' });
		const result = await verifyXhprofInstalled('/ext/dir', site);
		expect(result.status).toBe('error');
		expect(result.error).toContain('not found');
	});

	it('returns error when ini does not contain xhprof', async () => {
		fsExtra.existsSync.mockReturnValue(true);
		fsExtra.readFile.mockResolvedValue('[PHP]\nextension=opcache.so\n' as any);

		const site = createMockSite({ conf: '/sites/test/conf' });
		const result = await verifyXhprofInstalled('/ext/dir', site);
		expect(result.status).toBe('error');
		expect(result.error).toContain('not configured');
	});
});

// ---------------------------------------------------------------------------
// k6 functions
// ---------------------------------------------------------------------------

describe('getK6DownloadUrl', () => {
	const originalPlatform = process.platform;
	const originalArch = process.arch;

	afterEach(() => {
		Object.defineProperty(process, 'platform', { value: originalPlatform });
		Object.defineProperty(process, 'arch', { value: originalArch });
	});

	it('returns macOS arm64 URL', () => {
		Object.defineProperty(process, 'platform', { value: 'darwin' });
		Object.defineProperty(process, 'arch', { value: 'arm64' });
		expect(getK6DownloadUrl()).toContain('macos-arm64.zip');
	});

	it('returns macOS amd64 URL', () => {
		Object.defineProperty(process, 'platform', { value: 'darwin' });
		Object.defineProperty(process, 'arch', { value: 'x64' });
		expect(getK6DownloadUrl()).toContain('macos-amd64.zip');
	});

	it('returns Linux amd64 URL', () => {
		Object.defineProperty(process, 'platform', { value: 'linux' });
		Object.defineProperty(process, 'arch', { value: 'x64' });
		expect(getK6DownloadUrl()).toContain('linux-amd64.tar.gz');
	});

	it('returns Windows amd64 URL', () => {
		Object.defineProperty(process, 'platform', { value: 'win32' });
		Object.defineProperty(process, 'arch', { value: 'x64' });
		expect(getK6DownloadUrl()).toContain('windows-amd64.zip');
	});

	it('includes the pinned version', () => {
		expect(getK6DownloadUrl()).toContain(K6_VERSION);
	});

	it('throws for unsupported platform', () => {
		Object.defineProperty(process, 'platform', { value: 'freebsd' });
		expect(() => getK6DownloadUrl()).toThrow('Unsupported platform');
	});

	it('throws for unsupported arch', () => {
		Object.defineProperty(process, 'platform', { value: 'darwin' });
		Object.defineProperty(process, 'arch', { value: 'ia32' });
		expect(() => getK6DownloadUrl()).toThrow('Unsupported architecture');
	});
});

describe('checkK6Installed', () => {
	it('returns ready with version when k6 exists', async () => {
		fsExtra.existsSync.mockReturnValue(true);
		childProcess.execFile.mockImplementation(
			(_cmd: any, _args: any, _opts: any, cb: any) => {
				if (typeof cb === 'function') cb(null, 'k6 v0.54.0 (go1.22.5, darwin/arm64)', '');
				return {} as any;
			},
		);

		const result = await checkK6Installed();
		expect(result.status).toBe('ready');
		expect(result.version).toBe('v0.54.0');
	});

	it('returns missing when binary does not exist', async () => {
		fsExtra.existsSync.mockReturnValue(false);

		const result = await checkK6Installed();
		expect(result.status).toBe('missing');
	});

	it('returns error when version check fails', async () => {
		fsExtra.existsSync.mockReturnValue(true);
		childProcess.execFile.mockImplementation(
			(_cmd: any, _args: any, _opts: any, cb: any) => {
				if (typeof cb === 'function') cb(new Error('bad binary'), '', 'bad binary');
				return {} as any;
			},
		);

		const result = await checkK6Installed();
		expect(result.status).toBe('error');
	});
});

// ---------------------------------------------------------------------------
// Status aggregation
// ---------------------------------------------------------------------------

describe('getProfilerStatus', () => {
	it('returns missing for xhprof when .so is not cached', async () => {
		fsExtra.existsSync.mockReturnValue(false);

		const site = createMockSite();
		const result = await getProfilerStatus('/ext/dir', site, '8.2.0');
		expect(result.xhprof.status).toBe('missing');
		expect(result.k6.status).toBe('missing');
	});
});

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

describe('readProfilerCache', () => {
	it('returns profiler data when present', () => {
		const site = createMockSite({
			superchargedAddon: { profiler: { setupCompleted: true, phpVersion: '8.2.0' } },
		});
		expect(readProfilerCache(site)).toEqual({ setupCompleted: true, phpVersion: '8.2.0' });
	});

	it('returns undefined when no cache exists', () => {
		expect(readProfilerCache(createMockSite())).toBeUndefined();
	});
});

describe('writeProfilerCache', () => {
	it('preserves existing superchargedAddon fields', () => {
		const existing = { debugConstants: { WP_DEBUG: true }, cachedAt: 1700000000000 };
		const site = createMockSite({ id: 's1', superchargedAddon: existing });
		const siteData = createMockSiteData(site);

		writeProfilerCache(siteData as any, 's1', { setupCompleted: true, phpVersion: '8.2.0' });

		const args = siteData.updateSite.mock.calls[0][1];
		expect(args.superchargedAddon.debugConstants).toEqual({ WP_DEBUG: true });
		expect(args.superchargedAddon.profiler).toEqual({ setupCompleted: true, phpVersion: '8.2.0' });
	});
});
