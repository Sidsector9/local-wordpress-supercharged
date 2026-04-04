/**
 * vuln-scan.ipc.ts -- IPC handler registration for the vulnerability scan feature.
 */

import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS, VulnScanOptions, VulnScanResult } from '../../shared/types';
import { runVulnScan, SiteInfo } from './vuln-scan.service';

export interface VulnScanIpcDeps {
	siteData: LocalMain.Services.SiteDataService;
	logger: { info: ( msg: string ) => void; warn: ( msg: string ) => void };
}

export function registerVulnScanIpc( deps: VulnScanIpcDeps ): void {
	const { siteData, logger } = deps;

	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.START_VULN_SCAN,
		async ( siteId: string, options: VulnScanOptions ): Promise<VulnScanResult> => {
			const site = siteData.getSite( siteId ) as unknown as Local.Site;

			const currentSite: SiteInfo = {
				path: site.path,
				name: site.name,
				webRoot: site.paths.webRoot,
			};

			let allSites: SiteInfo[] = [];
			if ( options.scanAllSites ) {
				const sites = siteData.getSites() as unknown as Local.Sites;
				allSites = Object.values( sites ).map( ( s ) => ( {
					path: s.path,
					name: s.name,
					webRoot: s.paths.webRoot,
				} ) );
			}

			const onProgress = ( msg: string ): void => {
				logger.info( `[vuln-scan] ${ msg }` );
				LocalMain.sendIPCEvent( IPC_CHANNELS.VULN_SCAN_PROGRESS, siteId, msg );
			};

			try {
				const result = await runVulnScan( options, currentSite, allSites, onProgress );
				LocalMain.sendIPCEvent( IPC_CHANNELS.VULN_SCAN_COMPLETED, siteId, result );
				logger.info( `[vuln-scan] Completed: ${ result.matches.length } match(es) found` );
				return result;
			} catch ( e: any ) {
				logger.warn( `[vuln-scan] Failed: ${ e.message }` );
				const errorResult: VulnScanResult = {
					matches: [],
					toolsDetected: [],
					errors: [ e.message ],
					scannedLocations: 0,
					globalRootsScanned: [],
					cacheRootsScanned: [],
				};
				LocalMain.sendIPCEvent( IPC_CHANNELS.VULN_SCAN_COMPLETED, siteId, errorResult );
				return errorResult;
			}
		},
	);
}
