/**
 * conflict-test.ipc.ts -- IPC handler registration for the conflict testing feature.
 *
 * Channels:
 *   - GET_PLUGIN_LIST:          Fetch all plugins + dependencies via WP-CLI
 *   - GET_CONFLICT_OVERRIDES:   Read current override config
 *   - SET_CONFLICT_OVERRIDE:    Set a single plugin override (with cascade)
 *   - CLEAR_CONFLICT_OVERRIDES: Clear all overrides
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

/**
 * Dependencies required by the conflict test IPC handlers.
 */
export interface ConflictTestIpcDeps {
	wpCli: LocalMain.Services.WpCli;
	siteData: LocalMain.Services.SiteDataService;
	logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

/**
 * Registers all conflict-test-related IPC listeners on the main process.
 */
export function registerConflictTestIpc(deps: ConflictTestIpcDeps): void {
	const { wpCli, siteData, logger } = deps;

	// Cache dependencies per site to avoid repeated WP-CLI calls
	const depsCache: Record<string, PluginDependencyMap> = {};
	const pluginsCache: Record<string, PluginInfo[]> = {};

	/**
	 * GET_PLUGIN_LIST -- Returns plugins + dependencies in one call.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_PLUGIN_LIST,
		async (siteId: string): Promise<{ plugins: PluginInfo[]; dependencies: PluginDependencyMap }> => {
			const site = siteData.getSite(siteId);
			try {
				const [plugins, dependencies] = await Promise.all([
					getPluginList(wpCli, site as unknown as Local.Site),
					getPluginDependencies(wpCli, site as unknown as Local.Site),
				]);
				depsCache[siteId] = dependencies;
				pluginsCache[siteId] = plugins;
				return { plugins, dependencies };
			} catch (e: any) {
				logger.warn(`Failed to get plugin list for site ${siteId}: ${e.message}`);
				return { plugins: [], dependencies: {} };
			}
		},
	);

	/**
	 * GET_CONFLICT_OVERRIDES -- Returns the current override config.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.GET_CONFLICT_OVERRIDES,
		async (siteId: string): Promise<ConflictOverrides> => {
			const site = siteData.getSite(siteId);

			// Ensure mu-plugin is deployed
			try {
				await deployConflictTesterMuPlugin(site as unknown as Local.Site);
			} catch (e: any) {
				logger.warn(`Failed to deploy conflict tester mu-plugin: ${e.message}`);
			}

			return readOverrides(site as unknown as Local.Site);
		},
	);

	/**
	 * SET_CONFLICT_OVERRIDE -- Sets a plugin override with cascade.
	 * When deactivating a plugin, also deactivates all plugins that depend on it.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.SET_CONFLICT_OVERRIDE,
		async (siteId: string, pluginFile: string, active: boolean, dbStatus: 'active' | 'inactive'): Promise<ConflictOverrides> => {
			const site = siteData.getSite(siteId) as unknown as Local.Site;
			const deps = depsCache[siteId] || {};
			const plugins = pluginsCache[siteId] || [];

			// Set the override for the target plugin
			writeOverride(site, pluginFile, active, dbStatus);
			logger.info(`Conflict override: ${pluginFile} -> ${active ? 'active' : 'inactive'} (DB: ${dbStatus})`);

			if (!active) {
				// Cascade down: deactivating a plugin also deactivates its dependents
				const dependents = getDependentPlugins(pluginFile, deps, plugins);
				for (const depFile of dependents) {
					const depPlugin = plugins.find(p => p.file === depFile);
					if (depPlugin) {
						writeOverride(site, depFile, false, depPlugin.status);
						logger.info(`Cascade deactivation: ${depFile} (depends on ${pluginFile})`);
					}
				}
			} else {
				// Cascade up: activating a plugin also activates its requirements
				const requires = deps[pluginFile];
				if (requires) {
					const requiredSlugs = requires.split(',').map(s => s.trim());
					for (const slug of requiredSlugs) {
						const reqPlugin = plugins.find(p => p.file.startsWith(slug + '/'));
						if (reqPlugin) {
							writeOverride(site, reqPlugin.file, true, reqPlugin.status);
							logger.info(`Cascade activation: ${reqPlugin.file} (required by ${pluginFile})`);
						}
					}
				}
			}

			return readOverrides(site);
		},
	);

	/**
	 * CLEAR_CONFLICT_OVERRIDES -- Clears all overrides.
	 */
	LocalMain.addIpcAsyncListener(
		IPC_CHANNELS.CLEAR_CONFLICT_OVERRIDES,
		async (siteId: string): Promise<ConflictOverrides> => {
			const site = siteData.getSite(siteId);
			clearOverrides(site as unknown as Local.Site);
			logger.info(`Cleared all conflict overrides for site ${siteId}`);
			return readOverrides(site as unknown as Local.Site);
		},
	);
}
