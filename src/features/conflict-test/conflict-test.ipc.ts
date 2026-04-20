/**
 * conflict-test.ipc.ts -- IPC handler registration for the conflict testing feature.
 */

import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { IPC_CHANNELS, PluginInfo, ConflictOverrides, PluginDependencyMap } from '../../shared/types';
import {
	getPluginList,
	getPluginDependencies,
	getDependentPlugins,
	readOverrides,
	writeOverride,
	clearOverrides,
	deployConflictTesterMuPlugin,
} from './conflict-test.service';

export interface ConflictTestIpcDeps {
	wpCli: LocalMain.Services.WpCli;
	siteData: LocalMain.Services.SiteDataService;
	logger: { info: ( msg: string ) => void; warn: ( msg: string ) => void };
}

export function registerConflictTestIpc( deps: ConflictTestIpcDeps ): void {
	const { wpCli, siteData, logger } = deps;

	// Per-site caches to avoid repeated WP-CLI calls
	const depsCache: Record<string, PluginDependencyMap> = {};
	const pluginsCache: Record<string, PluginInfo[]> = {};

	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_PLUGIN_LIST,
		async ( siteId: string ): Promise<{ plugins: PluginInfo[]; dependencies: PluginDependencyMap }> => {
			const site = siteData.getSite( siteId );
			try {
				const [ plugins, dependencies ] = await Promise.all( [
					getPluginList( wpCli, site as unknown as Local.Site ),
					getPluginDependencies( wpCli, site as unknown as Local.Site ),
				] );
				depsCache[ siteId ] = dependencies;
				pluginsCache[ siteId ] = plugins;
				return { plugins, dependencies };
			} catch ( e: any ) {
				logger.warn( `Failed to get plugin list for site ${ siteId }: ${ e.message }` );
				return { plugins: [], dependencies: {} };
			}
		},
	);

	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_CONFLICT_OVERRIDES,
		async ( siteId: string ): Promise<ConflictOverrides> => {
			const site = siteData.getSite( siteId );

			try {
				await deployConflictTesterMuPlugin( site as unknown as Local.Site );
			} catch ( e: any ) {
				logger.warn( `Failed to deploy conflict tester mu-plugin: ${ e.message }` );
			}

			return readOverrides( site as unknown as Local.Site );
		},
	);

	// SET_CONFLICT_OVERRIDE -- Sets a plugin override with cascade.
	// Deactivating cascades down to dependents; activating cascades up to requirements.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.SET_CONFLICT_OVERRIDE,
		async ( siteId: string, pluginFile: string, active: boolean, dbStatus: 'active' | 'inactive' ): Promise<ConflictOverrides> => {
			const site = siteData.getSite( siteId ) as unknown as Local.Site;
			const cachedDeps = depsCache[ siteId ] || {};
			const plugins = pluginsCache[ siteId ] || [];

			writeOverride( site, pluginFile, active, dbStatus );
			logger.info( `Conflict override: ${ pluginFile } -> ${ active ? 'active' : 'inactive' } (DB: ${ dbStatus })` );

			if ( ! active ) {
				const dependents = getDependentPlugins( pluginFile, cachedDeps );
				for ( const depFile of dependents ) {
					const depPlugin = plugins.find( ( p ) => p.file === depFile );
					if ( depPlugin ) {
						writeOverride( site, depFile, false, depPlugin.status );
						logger.info( `Cascade deactivation: ${ depFile } (depends on ${ pluginFile })` );
					}
				}
			} else {
				const requires = cachedDeps[ pluginFile ];
				if ( requires ) {
					const requiredSlugs = requires.split( ',' ).map( ( s ) => s.trim() );
					for ( const slug of requiredSlugs ) {
						const reqPlugin = plugins.find( ( p ) => p.file.startsWith( slug + '/' ) );
						if ( reqPlugin ) {
							writeOverride( site, reqPlugin.file, true, reqPlugin.status );
							logger.info( `Cascade activation: ${ reqPlugin.file } (required by ${ pluginFile })` );
						}
					}
				}
			}

			return readOverrides( site );
		},
	);

	// BULK_SET_CONFLICT_OVERRIDES -- Sets the same override state for many plugins in one call.
	// Cascade logic is intentionally skipped: the caller is setting every listed plugin
	// to the same state, so dependency cascades would be redundant.
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.BULK_SET_CONFLICT_OVERRIDES,
		async ( siteId: string, pluginFiles: string[], active: boolean ): Promise<ConflictOverrides> => {
			const site = siteData.getSite( siteId ) as unknown as Local.Site;
			const plugins = pluginsCache[ siteId ] || [];

			for ( const pluginFile of pluginFiles ) {
				const plugin = plugins.find( ( p ) => p.file === pluginFile );
				if ( ! plugin ) {
					continue;
				}
				writeOverride( site, pluginFile, active, plugin.status );
			}

			logger.info(
				`Bulk conflict override: ${ pluginFiles.length } plugins -> ${ active ? 'active' : 'inactive' }`,
			);
			return readOverrides( site );
		},
	);

	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.CLEAR_CONFLICT_OVERRIDES,
		async ( siteId: string ): Promise<ConflictOverrides> => {
			const site = siteData.getSite( siteId );
			clearOverrides( site as unknown as Local.Site );
			logger.info( `Cleared all conflict overrides for site ${ siteId }` );
			return readOverrides( site as unknown as Local.Site );
		},
	);
}
