import 'jest-extended';

import {
	setNgrokConstants,
	removeNgrokConstants,
	readNgrokCache,
	writeNgrokCache,
	clearNgrokCache,
	findConflictingSites,
} from './ngrok.service';
import { createMockSite, createMockWpCli, createMockSiteData } from '../../test/mockCreators';

describe('setNgrokConstants', () => {
	it('calls wpCli.run for both WP_HOME and WP_SITEURL', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();
		wpCli.run.mockResolvedValue(undefined);

		await setNgrokConstants(wpCli as any, site, 'https://abcd.ngrok.io');

		expect(wpCli.run).toHaveBeenCalledTimes(2);
		expect(wpCli.run).toHaveBeenCalledWith(
			site,
			['config', 'set', 'WP_HOME', 'https://abcd.ngrok.io', '--add', `--path=${site.path}`],
		);
		expect(wpCli.run).toHaveBeenCalledWith(
			site,
			['config', 'set', 'WP_SITEURL', 'https://abcd.ngrok.io', '--add', `--path=${site.path}`],
		);
	});
});

describe('removeNgrokConstants', () => {
	it('calls config delete for both constants', async () => {
		const wpCli = createMockWpCli();
		const site = createMockSite();
		wpCli.run.mockResolvedValue(undefined);

		await removeNgrokConstants(wpCli as any, site);

		expect(wpCli.run).toHaveBeenCalledTimes(2);
		expect(wpCli.run).toHaveBeenCalledWith(site, ['config', 'delete', 'WP_HOME', `--path=${site.path}`]);
		expect(wpCli.run).toHaveBeenCalledWith(site, ['config', 'delete', 'WP_SITEURL', `--path=${site.path}`]);
	});

	it('does not throw when constants do not exist', async () => {
		const wpCli = createMockWpCli();
		wpCli.run.mockRejectedValue(new Error('not defined'));
		await expect(removeNgrokConstants(wpCli as any, createMockSite())).resolves.not.toThrow();
	});
});

describe('readNgrokCache', () => {
	it('returns ngrok data when present', () => {
		const site = createMockSite({
			superchargedAddon: { ngrok: { enabled: true, url: 'https://abcd.ngrok.io' } },
		});
		expect(readNgrokCache(site)).toEqual({ enabled: true, url: 'https://abcd.ngrok.io' });
	});

	it('returns undefined when no cache', () => {
		expect(readNgrokCache(createMockSite())).toBeUndefined();
	});
});

describe('writeNgrokCache', () => {
	it('preserves existing superchargedAddon fields', () => {
		const existing = { debugConstants: { WP_DEBUG: true }, cachedAt: 1700000000000 };
		const site = createMockSite({ id: 's1', superchargedAddon: existing });
		const siteData = createMockSiteData(site);

		writeNgrokCache(siteData as any, 's1', { enabled: true, url: 'https://abcd.ngrok.io' });

		const args = siteData.updateSite.mock.calls[0][1];
		expect(args.superchargedAddon.debugConstants).toEqual({ WP_DEBUG: true });
		expect(args.superchargedAddon.ngrok).toEqual({ enabled: true, url: 'https://abcd.ngrok.io' });
	});
});

describe('clearNgrokCache', () => {
	it('removes ngrok key while preserving other fields', () => {
		const existing = { debugConstants: { WP_DEBUG: true }, ngrok: { enabled: true, url: 'x' } };
		const site = createMockSite({ id: 's1', superchargedAddon: existing });
		const siteData = createMockSiteData(site);

		clearNgrokCache(siteData as any, 's1');

		const args = siteData.updateSite.mock.calls[0][1];
		expect(args.superchargedAddon).not.toHaveProperty('ngrok');
		expect(args.superchargedAddon.debugConstants).toEqual({ WP_DEBUG: true });
	});
});

describe('findConflictingSites', () => {
	it('returns site IDs with the same enabled ngrok URL', () => {
		const siteData = createMockSiteData();
		siteData.getSites.mockReturnValue({
			's1': createMockSite({ id: 's1', superchargedAddon: { ngrok: { enabled: true, url: 'x1' } } }),
			's2': createMockSite({ id: 's2', superchargedAddon: { ngrok: { enabled: false, url: 'x1' } } }),
		});
		expect(findConflictingSites(siteData as any, 'x1', 's3')).toEqual(['s1']);
	});

	it('excludes the current site', () => {
		const siteData = createMockSiteData();
		siteData.getSites.mockReturnValue({
			's1': createMockSite({ id: 's1', superchargedAddon: { ngrok: { enabled: true, url: 'x1' } } }),
		});
		expect(findConflictingSites(siteData as any, 'x1', 's1')).toEqual([]);
	});

	it('returns empty when no conflicts', () => {
		const siteData = createMockSiteData();
		siteData.getSites.mockReturnValue({ 's1': createMockSite({ id: 's1' }) });
		expect(findConflictingSites(siteData as any, 'x1', 's2')).toEqual([]);
	});
});
