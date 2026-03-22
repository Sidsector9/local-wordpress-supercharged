import 'jest-extended';

import * as path from 'path';
import {
	getWpConfigPath,
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

jest.mock('fs');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

describe('getWpConfigPath', () => {
	it('returns path joining webRoot with wp-config.php', () => {
		const site = createMockSite({ webRoot: '/sites/my-site/app/public' });
		const result = getWpConfigPath(site);
		expect(result).toBe(path.join('/sites/my-site/app/public', 'wp-config.php'));
	});

	it('handles different webRoot paths', () => {
		const site = createMockSite({ webRoot: '/other/path' });
		const result = getWpConfigPath(site);
		expect(result).toBe(path.join('/other/path', 'wp-config.php'));
	});
});

describe('getWpConfigMtime', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('returns mtimeMs from fs.statSync when file exists', () => {
		const mockMtime = 1700000000000;
		fs.statSync.mockReturnValue({ mtimeMs: mockMtime });

		const site = createMockSite();
		const result = getWpConfigMtime(site);

		expect(result).toBe(mockMtime);
		expect(fs.statSync).toHaveBeenCalledWith(getWpConfigPath(site));
	});

	it('returns 0 when fs.statSync throws', () => {
		fs.statSync.mockImplementation(() => {
			throw new Error('ENOENT');
		});

		const site = createMockSite();
		const result = getWpConfigMtime(site);

		expect(result).toBe(0);
	});
});

describe('fetchDebugConstants', () => {
	let wpCli: ReturnType<typeof createMockWpCli>;
	let site: ReturnType<typeof createMockSite>;

	beforeEach(() => {
		wpCli = createMockWpCli();
		site = createMockSite();
	});

	it('returns true for constants that WP-CLI reports as "1"', async () => {
		wpCli.run.mockResolvedValue('1');

		const result = await fetchDebugConstants(wpCli as any, site);

		expect(result.WP_DEBUG).toBe(true);
		expect(result.WP_DEBUG_LOG).toBe(true);
		expect(result.WP_DEBUG_DISPLAY).toBe(true);
	});

	it('returns true for constants that WP-CLI reports as "true"', async () => {
		wpCli.run.mockResolvedValue('true');

		const result = await fetchDebugConstants(wpCli as any, site);

		expect(result.WP_DEBUG).toBe(true);
	});

	it('returns true for "TRUE" (case insensitive)', async () => {
		wpCli.run.mockResolvedValue('TRUE');

		const result = await fetchDebugConstants(wpCli as any, site);

		expect(result.WP_DEBUG).toBe(true);
	});

	it('returns false for empty string response', async () => {
		wpCli.run.mockResolvedValue('');

		const result = await fetchDebugConstants(wpCli as any, site);

		expect(result.WP_DEBUG).toBe(false);
		expect(result.WP_DEBUG_LOG).toBe(false);
		expect(result.WP_DEBUG_DISPLAY).toBe(false);
	});

	it('returns false for "0" response', async () => {
		wpCli.run.mockResolvedValue('0');

		const result = await fetchDebugConstants(wpCli as any, site);

		expect(result.WP_DEBUG).toBe(false);
	});

	it('returns WP_DEFAULTS fallback when WP-CLI throws', async () => {
		wpCli.run.mockRejectedValue(new Error('WP-CLI failed'));

		const result = await fetchDebugConstants(wpCli as any, site);

		expect(result.WP_DEBUG).toBe(WP_DEFAULTS.WP_DEBUG);
		expect(result.WP_DEBUG_LOG).toBe(WP_DEFAULTS.WP_DEBUG_LOG);
		expect(result.WP_DEBUG_DISPLAY).toBe(WP_DEFAULTS.WP_DEBUG_DISPLAY);
	});

	it('calls wpCli.run once for each debug constant', async () => {
		wpCli.run.mockResolvedValue('1');

		await fetchDebugConstants(wpCli as any, site);

		expect(wpCli.run).toHaveBeenCalledTimes(4);
	});

	it('passes correct args to wpCli.run for each constant', async () => {
		wpCli.run.mockResolvedValue('1');

		await fetchDebugConstants(wpCli as any, site);

		expect(wpCli.run).toHaveBeenCalledWith(site, ['config', 'get', 'WP_DEBUG', `--path=${site.path}`]);
		expect(wpCli.run).toHaveBeenCalledWith(site, ['config', 'get', 'WP_DEBUG_LOG', `--path=${site.path}`]);
		expect(wpCli.run).toHaveBeenCalledWith(site, ['config', 'get', 'WP_DEBUG_DISPLAY', `--path=${site.path}`]);
	});

	it('handles mixed results (some succeed, some fail)', async () => {
		wpCli.run
			.mockResolvedValueOnce('1')                        // WP_DEBUG -> true
			.mockRejectedValueOnce(new Error('not defined'))   // WP_DEBUG_LOG -> WP_DEFAULTS
			.mockResolvedValueOnce('');                         // WP_DEBUG_DISPLAY -> false

		const result = await fetchDebugConstants(wpCli as any, site);

		expect(result.WP_DEBUG).toBe(true);
		expect(result.WP_DEBUG_LOG).toBe(false);
		expect(result.WP_DEBUG_DISPLAY).toBe(false);
	});

	it('trims whitespace from WP-CLI response', async () => {
		wpCli.run.mockResolvedValue('  1  \n');

		const result = await fetchDebugConstants(wpCli as any, site);

		expect(result.WP_DEBUG).toBe(true);
	});
});

describe('setDebugConstant', () => {
	it('calls wpCli.run with "true" when value is true', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();
		wpCli.run.mockResolvedValue(undefined);

		await setDebugConstant(wpCli as any, site, 'WP_DEBUG', true);

		expect(wpCli.run).toHaveBeenCalledWith(
			site,
			['config', 'set', 'WP_DEBUG', 'true', '--raw', '--add', `--path=${site.path}`],
		);
	});

	it('calls wpCli.run with "false" when value is false', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();
		wpCli.run.mockResolvedValue(undefined);

		await setDebugConstant(wpCli as any, site, 'WP_DEBUG', false);

		expect(wpCli.run).toHaveBeenCalledWith(
			site,
			['config', 'set', 'WP_DEBUG', 'false', '--raw', '--add', `--path=${site.path}`],
		);
	});
});

describe('isConstantDefined', () => {
	it('returns true when wpCli.run succeeds', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();
		wpCli.run.mockResolvedValue('1');

		const result = await isConstantDefined(wpCli as any, site, 'WP_DEBUG');

		expect(result).toBe(true);
	});

	it('returns false when wpCli.run throws', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();
		wpCli.run.mockRejectedValue(new Error('not defined'));

		const result = await isConstantDefined(wpCli as any, site, 'WP_DEBUG');

		expect(result).toBe(false);
	});
});

describe('deleteConstant', () => {
	it('calls wpCli.run with config delete args', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();
		wpCli.run.mockResolvedValue(undefined);

		await deleteConstant(wpCli as any, site, 'WP_DEBUG_DISPLAY');

		expect(wpCli.run).toHaveBeenCalledWith(
			site,
			['config', 'delete', 'WP_DEBUG_DISPLAY', `--path=${site.path}`],
		);
	});
});

describe('readCache', () => {
	it('returns superchargedAddon data when present', () => {
		const cacheData = {
			debugConstants: { WP_DEBUG: true, WP_DEBUG_LOG: false, WP_DEBUG_DISPLAY: true },
			cachedAt: 1700000000000,
			cacheVersion: CACHE_VERSION,
		};
		const site = createMockSite({ superchargedAddon: cacheData });

		const result = readCache(site);

		expect(result).toEqual(cacheData);
	});

	it('returns undefined when no cache exists', () => {
		const site = createMockSite();

		const result = readCache(site);

		expect(result).toBeUndefined();
	});
});

describe('writeCache', () => {
	it('calls siteData.updateSite with correct shape', () => {
		const siteData = createMockSiteData();
		const siteId = 'abc123';
		const cache = { WP_DEBUG: true, WP_DEBUG_LOG: false, WP_DEBUG_DISPLAY: true } as any;

		const dateBefore = Date.now();
		writeCache(siteData as any, siteId, cache);
		const dateAfter = Date.now();

		expect(siteData.updateSite).toHaveBeenCalledTimes(1);

		const callArgs = siteData.updateSite.mock.calls[0];
		expect(callArgs[0]).toBe(siteId);
		expect(callArgs[1].id).toBe(siteId);
		expect(callArgs[1].superchargedAddon.debugConstants).toEqual(cache);
		expect(callArgs[1].superchargedAddon.cacheVersion).toBe(CACHE_VERSION);
		expect(callArgs[1].superchargedAddon.cachedAt).toBeGreaterThanOrEqual(dateBefore);
		expect(callArgs[1].superchargedAddon.cachedAt).toBeLessThanOrEqual(dateAfter);
	});
});
