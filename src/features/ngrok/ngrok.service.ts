/**
 * ngrok.service.ts -- Pure functions for reading/writing WP_HOME and WP_SITEURL
 * via WP-CLI, and for managing the ngrok URL mapping in SiteJSON.
 *
 * All functions are stateless and take their dependencies as arguments,
 * making them independently testable and reusable from any context
 * (IPC handlers, hooks, direct calls from other features).
 */

import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { NgrokCache, NGROK_CONSTANTS, SuperchargedCache } from '../../shared/types';

/**
 * Sets WP_HOME and WP_SITEURL to the given ngrok URL in wp-config.php.
 *
 * Runs `wp config set <constant> <url> --add --path=<site_path>` for each
 * constant. The `--add` flag creates the constant if it doesn't already exist.
 *
 * @param wpCli -- The WpCli service instance from Local's service container.
 * @param site  -- The Local Site object.
 * @param url   -- The ngrok URL to set (e.g. "https://foo.ngrok-free.dev").
 */
export async function setNgrokConstants(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
	url: string,
): Promise<void> {
	for (const constant of NGROK_CONSTANTS) {
		await wpCli.run(site, ['config', 'set', constant, url, '--add', `--path=${site.path}`]);
	}
}

/**
 * Removes WP_HOME and WP_SITEURL from wp-config.php.
 *
 * Runs `wp config delete <constant> --path=<site_path>` for each constant.
 * Silently catches errors for constants that don't exist (e.g. if the user
 * manually deleted them or they were never set).
 *
 * @param wpCli -- The WpCli service instance.
 * @param site  -- The Local Site object.
 */
export async function removeNgrokConstants(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
): Promise<void> {
	for (const constant of NGROK_CONSTANTS) {
		try {
			await wpCli.run(site, ['config', 'delete', constant, `--path=${site.path}`]);
		} catch {
			// Constant may not exist
		}
	}
}

/**
 * Reads the cached ngrok state from the SiteJSON object.
 *
 * The `superchargedAddon` property is a custom field written by this addon;
 * it doesn't exist in the official SiteJSON type, hence the `as any` cast.
 *
 * @param site -- The Local Site object.
 * @returns    -- The cached ngrok data, or undefined if no cache exists.
 */
export function readNgrokCache(site: Local.Site): NgrokCache | undefined {
	const cache = (site as any).superchargedAddon as SuperchargedCache | undefined;
	return cache?.ngrok;
}

/**
 * Persists the ngrok state onto the SiteJSON object via Local's
 * `siteData.updateSite()` method.
 *
 * The data is stored under `superchargedAddon.ngrok` and survives app
 * restarts. Existing fields on `superchargedAddon` (e.g. debugConstants)
 * are preserved via spread.
 *
 * @param siteData -- The SiteDataService instance from Local's service container.
 * @param siteId   -- The unique identifier of the site to update.
 * @param ngrok    -- The ngrok state to persist (enabled flag + URL).
 */
export function writeNgrokCache(
	siteData: LocalMain.Services.SiteDataService,
	siteId: string,
	ngrok: NgrokCache,
): void {
	const site = siteData.getSite(siteId);
	const existing = (site as any)?.superchargedAddon || {};

	siteData.updateSite(siteId, {
		id: siteId,
		superchargedAddon: {
			...existing,
			ngrok,
		},
	} as Partial<Local.SiteJSON>);
}

/**
 * Removes the ngrok key from the SiteJSON cache while preserving other
 * superchargedAddon fields (e.g. debugConstants).
 *
 * Called when the user clicks "Clear" to remove the URL mapping entirely.
 *
 * @param siteData -- The SiteDataService instance.
 * @param siteId   -- The unique identifier of the site to update.
 */
export function clearNgrokCache(
	siteData: LocalMain.Services.SiteDataService,
	siteId: string,
): void {
	const site = siteData.getSite(siteId);
	const existing = (site as any)?.superchargedAddon || {};
	const { ngrok: _removed, ...rest } = existing;

	siteData.updateSite(siteId, {
		id: siteId,
		superchargedAddon: rest,
	} as Partial<Local.SiteJSON>);
}

/**
 * Finds all sites that have the same ngrok URL enabled, excluding
 * the given site.
 *
 * Used during ENABLE_NGROK to detect URL collisions: if site B tries
 * to enable the same URL that site A is already using, site A must be
 * disabled first to avoid both sites having conflicting WP_HOME values.
 *
 * @param siteData      -- The SiteDataService instance.
 * @param url           -- The ngrok URL to check for conflicts.
 * @param excludeSiteId -- The site initiating the enable (excluded from results).
 * @returns             -- Array of site IDs that have this URL enabled.
 */
export function findConflictingSites(
	siteData: LocalMain.Services.SiteDataService,
	url: string,
	excludeSiteId: string,
): string[] {
	const sites = siteData.getSites();
	const conflicting: string[] = [];

	for (const siteId of Object.keys(sites)) {
		if (siteId === excludeSiteId) {
			continue;
		}

		const ngrok = readNgrokCache(sites[siteId] as unknown as Local.Site);

		if (ngrok?.enabled && ngrok.url === url) {
			conflicting.push(siteId);
		}
	}

	return conflicting;
}
