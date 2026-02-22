import * as fs from 'fs';
import * as path from 'path';
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';

const DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY'] as const;

type DebugCache = Record<string, boolean>;

interface SuperchargedCache {
	debugConstants: DebugCache;
	cachedAt: number;
}

function getWpConfigPath(site: Local.Site): string {
	return path.join(site.paths.webRoot, 'wp-config.php');
}

function getWpConfigMtime(site: Local.Site): number {
	try {
		return fs.statSync(getWpConfigPath(site)).mtimeMs;
	} catch {
		return 0;
	}
}

async function fetchDebugConstants(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
): Promise<DebugCache> {
	const results: DebugCache = {};

	for (const constant of DEBUG_CONSTANTS) {
		try {
			const value = await wpCli.run(site, ['config', 'get', constant, `--path=${site.path}`], { ignoreErrors: true });
			results[constant] = value?.trim() === '1' || value?.trim().toLowerCase() === 'true';
		} catch (e) {
			results[constant] = false;
		}
	}

	return results;
}

function updateCache(
	siteData: LocalMain.Services.SiteDataService,
	siteId: string,
	cache: DebugCache,
): void {
	siteData.updateSite(siteId, {
		id: siteId,
		superchargedAddon: {
			debugConstants: cache,
			cachedAt: Date.now(),
		},
	} as Partial<Local.SiteJSON>);
}

export default function (context: LocalMain.AddonMainContext): void {
	const { wpCli, siteData, localLogger } = LocalMain.getServiceContainer().cradle;

	const logger = localLogger.child({
		thread: 'main',
		addon: 'wordpress-supercharged',
	});

	const watchers = new Map<string, fs.FSWatcher>();
	const selfWriting = new Set<string>();

	function watchSite(siteId: string): void {
		if (watchers.has(siteId)) {
			return;
		}

		const site = siteData.getSite(siteId);
		const configPath = getWpConfigPath(site);

		try {
			const watcher = fs.watch(configPath, async (eventType) => {
				if (eventType !== 'change') {
					return;
				}

				if (selfWriting.has(siteId)) {
					return;
				}

				logger.info(`wp-config.php changed externally for site ${siteId}, refreshing`);

				const freshSite = siteData.getSite(siteId);
				const results = await fetchDebugConstants(wpCli, freshSite);
				updateCache(siteData, siteId, results);

				LocalMain.sendIPCEvent('supercharged:debug-constants-changed', siteId, results);
			});

			watchers.set(siteId, watcher);
		} catch (e) {
			logger.warn(`Could not watch wp-config.php for site ${siteId}: ${e}`);
		}
	}

	LocalMain.addIpcAsyncListener(
		'supercharged:watch-site',
		async (siteId: string) => {
			watchSite(siteId);
		},
	);

	LocalMain.addIpcAsyncListener(
		'supercharged:unwatch-site',
		async (siteId: string) => {
			const watcher = watchers.get(siteId);
			if (watcher) {
				watcher.close();
				watchers.delete(siteId);
			}
		},
	);

	LocalMain.addIpcAsyncListener(
		'supercharged:get-debug-constants',
		async (siteId: string) => {
			const site = siteData.getSite(siteId);
			const cached = (site as any).superchargedAddon as SuperchargedCache | undefined;

			if (cached?.debugConstants && cached.cachedAt >= getWpConfigMtime(site)) {
				logger.info(`Returning cached debug constants for site ${siteId}`);
				return cached.debugConstants;
			}

			const results = await fetchDebugConstants(wpCli, site);
			updateCache(siteData, siteId, results);

			logger.info(`Fetched and cached debug constants for site ${siteId}: ${JSON.stringify(results)}`);
			return results;
		},
	);

	LocalMain.addIpcAsyncListener(
		'supercharged:set-debug-constant',
		async (siteId: string, constant: string, value: boolean) => {
			const site = siteData.getSite(siteId);
			const wpValue = value ? 'true' : 'false';

			selfWriting.add(siteId);
			try {
				await wpCli.run(site, ['config', 'set', constant, wpValue, '--raw', '--add', `--path=${site.path}`]);
			} finally {
				setTimeout(() => selfWriting.delete(siteId), 500);
			}

			const cached = (site as any).superchargedAddon as SuperchargedCache | undefined;
			const updatedCache = { ...cached?.debugConstants, [constant]: value };
			updateCache(siteData, siteId, updatedCache);

			logger.info(`Set ${constant} to ${wpValue} for site ${siteId} and updated cache`);
			return { success: true };
		},
	);
}
