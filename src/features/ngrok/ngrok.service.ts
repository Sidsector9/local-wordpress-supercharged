/**
 * ngrok.service.ts -- Pure functions for reading/writing WP_HOME and WP_SITEURL
 * via WP-CLI, and for managing the ngrok URL mapping in SiteJSON.
 */

import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { NgrokCache, NGROK_CONSTANTS, SuperchargedCache } from '../../shared/types';
import { readSuperchargedCache, writeSuperchargedCache } from '../../shared/cache';

export async function setNgrokConstants(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
	url: string,
): Promise<void> {
	for ( const constant of NGROK_CONSTANTS ) {
		await wpCli.run( site, [ 'config', 'set', constant, url, '--add', `--path=${ site.path }` ] );
	}
}

export async function removeNgrokConstants(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
): Promise<void> {
	for ( const constant of NGROK_CONSTANTS ) {
		try {
			await wpCli.run( site, [ 'config', 'delete', constant, `--path=${ site.path }` ] );
		} catch {
			// Constant may not exist
		}
	}
}

export function readNgrokCache( site: Local.Site ): NgrokCache | undefined {
	return readSuperchargedCache( site )?.ngrok;
}

export function writeNgrokCache(
	siteData: LocalMain.Services.SiteDataService,
	siteId: string,
	ngrok: NgrokCache,
): void {
	writeSuperchargedCache( siteData, siteId, { ngrok } );
}

export function clearNgrokCache(
	siteData: LocalMain.Services.SiteDataService,
	siteId: string,
): void {
	const site = siteData.getSite( siteId );
	const existing = readSuperchargedCache( site ) || {} as SuperchargedCache;
	const { ngrok: _removed, ...rest } = existing;

	siteData.updateSite( siteId, {
		id: siteId,
		superchargedAddon: rest,
	} as Partial<Local.SiteJSON> );
}

/**
 * Finds all sites that have the same ngrok URL enabled, excluding the given site.
 * @param siteData
 * @param url
 * @param excludeSiteId
 */
export function findConflictingSites(
	siteData: LocalMain.Services.SiteDataService,
	url: string,
	excludeSiteId: string,
): string[] {
	const sites = siteData.getSites();
	const conflicting: string[] = [];

	for ( const siteId of Object.keys( sites ) ) {
		if ( siteId === excludeSiteId ) {
			continue;
		}

		const ngrok = readNgrokCache( sites[ siteId ] as unknown as Local.Site );

		if ( ngrok?.enabled && ngrok.url === url ) {
			conflicting.push( siteId );
		}
	}

	return conflicting;
}
