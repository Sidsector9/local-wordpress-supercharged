/**
 * debug-constants.service.ts — Pure functions for reading and writing WordPress
 * debug constants via WP-CLI, and for reading/writing the SiteJSON cache.
 *
 * All functions are stateless and take their dependencies as arguments,
 * making them independently testable and reusable from any context
 * (IPC handlers, hooks, direct calls from other features).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { DEBUG_CONSTANTS, DebugConstantsMap, SuperchargedCache } from '../../shared/types';

/**
 * Returns the absolute filesystem path to wp-config.php for a given site.
 *
 * Local stores a site's WordPress files under `site.paths.webRoot`, which
 * typically resolves to something like:
 *   ~/Local Sites/<site-name>/app/public/
 *
 * @param site — The Local Site object.
 * @returns    — Absolute path to wp-config.php.
 */
export function getWpConfigPath(site: Local.Site): string {
	return path.join(site.paths.webRoot, 'wp-config.php');
}

/**
 * Returns the last-modified time (in milliseconds) of wp-config.php for a site.
 *
 * Used for cache invalidation: if the file's mtime is newer than
 * `SuperchargedCache.cachedAt`, the cache is considered stale.
 *
 * Uses `fs.statSync` because it's a single synchronous stat call (~0.1ms),
 * which is far cheaper than spawning three WP-CLI processes.
 *
 * @param site — The Local Site object.
 * @returns    — The file's mtimeMs, or 0 if the file doesn't exist or can't be read.
 */
export function getWpConfigMtime(site: Local.Site): number {
	try {
		return fs.statSync(getWpConfigPath(site)).mtimeMs;
	} catch {
		return 0;
	}
}

/**
 * Fetches the current values of all three debug constants from wp-config.php
 * by running `wp config get <constant> --path=<site_path>` for each one.
 *
 * WordPress stores these as PHP constants via `define()`. The WP-CLI `config get`
 * command reads the raw PHP value:
 *   - `define('WP_DEBUG', true)`  → WP-CLI returns "1"
 *   - `define('WP_DEBUG', false)` → WP-CLI returns "" (empty string)
 *   - Constant not defined        → WP-CLI throws / returns null
 *
 * Each constant is evaluated as a boolean:
 *   - "1" or "true" (case-insensitive) → true
 *   - Anything else (empty, null, error) → false
 *
 * @param wpCli — The WpCli service instance from Local's service container.
 * @param site  — The Local Site object.
 * @returns     — A DebugConstantsMap mapping each constant name to its boolean value.
 */
export async function fetchDebugConstants(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
): Promise<DebugConstantsMap> {
	const results = {} as DebugConstantsMap;

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

/**
 * Sets a single debug constant in wp-config.php via WP-CLI.
 *
 * Runs: `wp config set <constant> true|false --raw --add --path=<site_path>`
 *   - `--raw` writes the value as a raw PHP expression (true/false without quotes).
 *   - `--add` creates the constant if it doesn't already exist.
 *
 * @param wpCli    — The WpCli service instance.
 * @param site     — The Local Site object.
 * @param constant — The constant name (e.g. "WP_DEBUG").
 * @param value    — The new boolean value to set.
 */
export async function setDebugConstant(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
	constant: string,
	value: boolean,
): Promise<void> {
	const wpValue = value ? 'true' : 'false';
	await wpCli.run(site, ['config', 'set', constant, wpValue, '--raw', '--add', `--path=${site.path}`]);
}

/**
 * Reads the cached debug constants from the SiteJSON object.
 *
 * The `superchargedAddon` property is a custom field written by this addon;
 * it doesn't exist in the official SiteJSON type, hence the `as any` cast.
 *
 * @param site — The Local Site object.
 * @returns    — The cached data, or undefined if no cache exists.
 */
export function readCache(site: Local.Site): SuperchargedCache | undefined {
	return (site as any).superchargedAddon as SuperchargedCache | undefined;
}

/**
 * Persists the debug constant cache onto the SiteJSON object via Local's
 * `siteData.updateSite()` method.
 *
 * The data is stored under `superchargedAddon` and survives app restarts.
 * The `cachedAt` timestamp is set to `Date.now()` so that future reads can
 * compare it against wp-config.php's mtime for staleness detection.
 *
 * @param siteData — The SiteDataService instance from Local's service container.
 * @param siteId   — The unique identifier of the site to update.
 * @param cache    — The debug constant values to persist.
 */
export function writeCache(
	siteData: LocalMain.Services.SiteDataService,
	siteId: string,
	cache: DebugConstantsMap,
): void {
	siteData.updateSite(siteId, {
		id: siteId,
		superchargedAddon: {
			debugConstants: cache,
			cachedAt: Date.now(),
		},
	} as Partial<Local.SiteJSON>);
}
