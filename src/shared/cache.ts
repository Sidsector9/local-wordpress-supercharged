/**
 * cache.ts -- Shared utilities for reading and writing the addon's
 * per-site cache stored on the SiteJSON object at `superchargedAddon`.
 *
 * Every feature that persists data on SiteJSON should use these helpers
 * instead of casting `(site as any).superchargedAddon` inline.
 */

import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { SuperchargedCache } from './types';

/**
 * Reads the addon's cache from a site's SiteJSON object.
 *
 * @param site - The Local site to read from.
 */
export function readSuperchargedCache( site: Local.Site ): SuperchargedCache | undefined {
	return ( site as any ).superchargedAddon as SuperchargedCache | undefined;
}

/**
 * Merges partial cache data into the addon's SiteJSON cache,
 * preserving fields written by other features.
 *
 * @param siteData - The SiteDataService instance.
 * @param siteId   - The site ID to update.
 * @param partial  - Fields to merge into the existing cache.
 */
export function writeSuperchargedCache(
	siteData: LocalMain.Services.SiteDataService,
	siteId: string,
	partial: Partial<SuperchargedCache>,
): void {
	const site = siteData.getSite( siteId );
	const existing = ( site as any )?.superchargedAddon || {};

	siteData.updateSite( siteId, {
		id: siteId,
		superchargedAddon: { ...existing, ...partial },
	} as Partial<Local.SiteJSON> );
}
