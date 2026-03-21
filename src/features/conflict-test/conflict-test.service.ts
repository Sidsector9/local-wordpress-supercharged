/**
 * conflict-test.service.ts -- Pure functions for reading the plugin list,
 * managing conflict test overrides, and deploying the mu-plugin.
 *
 * All functions are stateless and take their dependencies as arguments.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { PluginInfo, ConflictOverrides, PluginDependencyMap } from '../../shared/types';

/** Name of the override config file in wp-content. */
const OVERRIDES_FILENAME = 'conflict-test-overrides.json';

/** Name of the mu-plugin file. */
const MU_PLUGIN_FILENAME = 'wp-conflict-tester.php';

/**
 * Returns the path to the overrides JSON file for a site.
 */
export function getOverridesPath(site: Local.Site): string {
	return path.join(site.paths.webRoot, 'wp-content', OVERRIDES_FILENAME);
}

/**
 * Fetches the list of plugins (active + inactive) via WP-CLI.
 * Excludes mu-plugins.
 */
export async function getPluginList(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
): Promise<PluginInfo[]> {
	const result = await wpCli.run(site, [
		'plugin', 'list',
		'--status=active,inactive',
		'--format=json',
		'--fields=name,status,version,file',
	]);

	if (!result) return [];

	try {
		return JSON.parse(result) as PluginInfo[];
	} catch {
		return [];
	}
}

/**
 * Fetches plugin dependency data via WP-CLI.
 * Returns a map of plugin file -> comma-separated required plugin slugs.
 */
export async function getPluginDependencies(
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
): Promise<PluginDependencyMap> {
	try {
		const result = await wpCli.run(site, [
			'eval',
			'foreach(get_plugins() as $f=>$d) if(!empty($d["RequiresPlugins"])) echo json_encode([$f,$d["RequiresPlugins"]]).PHP_EOL;',
		]);

		if (!result) return {};

		const deps: PluginDependencyMap = {};
		for (const line of result.trim().split('\n')) {
			if (!line.trim()) continue;
			try {
				const [file, requires] = JSON.parse(line);
				deps[file] = requires;
			} catch {
				// skip malformed lines
			}
		}
		return deps;
	} catch {
		return {};
	}
}

/**
 * Given a plugin being deactivated, returns the list of dependent plugins
 * that should also be deactivated (cascade).
 *
 * @param pluginFile - The plugin file being deactivated (e.g. "woocommerce/woocommerce.php")
 * @param deps - The dependency map from getPluginDependencies
 * @param plugins - The full plugin list
 * @returns Array of plugin files that depend on the deactivated plugin
 */
export function getDependentPlugins(
	pluginFile: string,
	deps: PluginDependencyMap,
	plugins: PluginInfo[],
): string[] {
	// Extract the slug from the plugin file (e.g. "woocommerce" from "woocommerce/woocommerce.php")
	const slug = pluginFile.split('/')[0];

	const dependents: string[] = [];
	for (const [file, requires] of Object.entries(deps)) {
		const requiredSlugs = requires.split(',').map(s => s.trim());
		if (requiredSlugs.includes(slug)) {
			dependents.push(file);
		}
	}

	return dependents;
}

/**
 * Reads the current conflict test overrides from the site's config file.
 * Returns an empty overrides object if the file doesn't exist.
 */
export function readOverrides(site: Local.Site): ConflictOverrides {
	const filePath = getOverridesPath(site);

	if (!fs.existsSync(filePath)) {
		return { overrides: {} };
	}

	try {
		const data = fs.readFileSync(filePath, 'utf8');
		return JSON.parse(data) as ConflictOverrides;
	} catch {
		return { overrides: {} };
	}
}

/**
 * Sets a single plugin override. If the override matches the plugin's
 * DB status, the entry is removed (no-op override).
 */
export function writeOverride(
	site: Local.Site,
	pluginBasename: string,
	active: boolean,
	dbStatus: 'active' | 'inactive',
): void {
	const filePath = getOverridesPath(site);
	const config = readOverrides(site);

	// If the override matches DB state, remove it (no override needed)
	const matchesDb = (active && dbStatus === 'active') || (!active && dbStatus === 'inactive');
	if (matchesDb) {
		delete config.overrides[pluginBasename];
	} else {
		config.overrides[pluginBasename] = active;
	}

	// If no overrides remain, delete the file
	if (Object.keys(config.overrides).length === 0) {
		if (fs.existsSync(filePath)) {
			fs.removeSync(filePath);
		}
		return;
	}

	fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Clears all conflict test overrides by deleting the config file.
 */
export function clearOverrides(site: Local.Site): void {
	const filePath = getOverridesPath(site);
	if (fs.existsSync(filePath)) {
		fs.removeSync(filePath);
	}
}

/**
 * Deploys the conflict tester mu-plugin to the canonical location
 * and symlinks it into the site's mu-plugins directory.
 */
export async function deployConflictTesterMuPlugin(
	site: Local.Site,
): Promise<void> {
	const canonicalDir = path.join(os.homedir(), '.wp-profiler', 'mu-plugin');
	const canonicalPath = path.join(canonicalDir, MU_PLUGIN_FILENAME);
	const source = path.join(__dirname, MU_PLUGIN_FILENAME);

	// Write canonical copy
	await fs.ensureDir(canonicalDir);
	if (fs.existsSync(source)) {
		await fs.copy(source, canonicalPath, { overwrite: true });
	}

	// Symlink into site
	const siteMuPluginsDir = path.join(site.paths.webRoot, 'wp-content', 'mu-plugins');
	await fs.ensureDir(siteMuPluginsDir);

	const symlinkPath = path.join(siteMuPluginsDir, MU_PLUGIN_FILENAME);

	if (fs.existsSync(symlinkPath)) {
		const stat = await fs.lstat(symlinkPath);
		if (stat.isSymbolicLink()) {
			const target = await fs.readlink(symlinkPath);
			if (target === canonicalPath) return;
			await fs.remove(symlinkPath);
		} else {
			return; // Regular file, don't overwrite
		}
	}

	await fs.ensureSymlink(canonicalPath, symlinkPath);
}
