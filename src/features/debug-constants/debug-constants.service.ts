/**
 * debug-constants.service.ts -- Pure functions for reading/writing WordPress
 * debug constants via WP-CLI, and for reading/writing the SiteJSON cache.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { CACHE_VERSION, DEBUG_CONSTANTS, DebugConstantName, DebugConstantsMap, SuperchargedCache, WP_DEFAULTS } from '../../shared/types';

export function getWpConfigPath(site: Local.Site): string {
	return path.join(site.paths.webRoot, 'wp-config.php');
}

/** Returns wp-config.php mtime in ms, or 0 if unreadable. Used for cache invalidation. */
export function getWpConfigMtime(site: Local.Site): number {
	try {
		return fs.statSync(getWpConfigPath(site)).mtimeMs;
	} catch {
		return 0;
	}
}

/**
 * Fetches current values of all debug constants via WP-CLI `config get`.
 *
 * WP-CLI returns "1" for true, "" for false, throws for undefined.
 * Falls back to WP_DEFAULTS when a constant is not defined.
 */
export async function fetchDebugConstants(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
): Promise<DebugConstantsMap> {
	const results = {} as DebugConstantsMap;

	for (const constant of DEBUG_CONSTANTS) {
		try {
			const value = await wpCli.run(site, ['config', 'get', constant, `--path=${site.path}`]);
			results[constant] = value?.trim() === '1' || value?.trim().toLowerCase() === 'true';
		} catch (e) {
			results[constant] = WP_DEFAULTS[constant as DebugConstantName];
		}
	}

	return results;
}

export async function setDebugConstant(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
	constant: string,
	value: boolean,
): Promise<void> {
	const wpValue = value ? 'true' : 'false';
	await wpCli.run(site, ['config', 'set', constant, wpValue, '--raw', '--add', `--path=${site.path}`]);
}

export async function isConstantDefined(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
	constant: string,
): Promise<boolean> {
	try {
		await wpCli.run(site, ['config', 'get', constant, `--path=${site.path}`]);
		return true;
	} catch {
		return false;
	}
}

export async function deleteConstant(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
	constant: string,
): Promise<void> {
	await wpCli.run(site, ['config', 'delete', constant, `--path=${site.path}`]);
}

export function readCache(site: Local.Site): SuperchargedCache | undefined {
	return (site as any).superchargedAddon as SuperchargedCache | undefined;
}

export function writeCache(
	siteData: LocalMain.Services.SiteDataService,
	siteId: string,
	cache: DebugConstantsMap,
): void {
	const site = siteData.getSite(siteId);
	const existing = (site as any)?.superchargedAddon || {};

	siteData.updateSite(siteId, {
		id: siteId,
		superchargedAddon: {
			...existing,
			debugConstants: cache,
			cachedAt: Date.now(),
			cacheVersion: CACHE_VERSION,
		},
	} as Partial<Local.SiteJSON>);
}
