/**
 * conflict-test.service.ts -- Pure functions for reading the plugin list,
 * managing conflict test overrides, and deploying the mu-plugin.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { PluginInfo, ConflictOverrides, PluginDependencyMap } from '../../shared/types';

const OVERRIDES_FILENAME = 'conflict-test-overrides.json';
const MU_PLUGIN_FILENAME = 'wp-conflict-tester.php';

export function getOverridesPath(site: Local.Site): string {
	return path.join(site.paths.webRoot, 'wp-content', OVERRIDES_FILENAME);
}

/** Fetches plugins (active + inactive, excluding mu-plugins) via WP-CLI. */
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

/** Fetches plugin dependency data (RequiresPlugins header, WP 6.5+) via WP-CLI. */
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

/** Returns plugin files that depend on the given plugin (for cascade deactivation). */
export function getDependentPlugins(
	pluginFile: string,
	deps: PluginDependencyMap,
	plugins: PluginInfo[],
): string[] {
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
 * DB status, the entry is removed (no-op override). If no overrides remain,
 * the file is deleted.
 */
export function writeOverride(
	site: Local.Site,
	pluginBasename: string,
	active: boolean,
	dbStatus: 'active' | 'inactive',
): void {
	const filePath = getOverridesPath(site);
	const config = readOverrides(site);

	const matchesDb = (active && dbStatus === 'active') || (!active && dbStatus === 'inactive');
	if (matchesDb) {
		delete config.overrides[pluginBasename];
	} else {
		config.overrides[pluginBasename] = active;
	}

	if (Object.keys(config.overrides).length === 0) {
		if (fs.existsSync(filePath)) {
			fs.removeSync(filePath);
		}
		return;
	}

	fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

export function clearOverrides(site: Local.Site): void {
	const filePath = getOverridesPath(site);
	if (fs.existsSync(filePath)) {
		fs.removeSync(filePath);
	}
}

/**
 * Deploys the conflict tester mu-plugin to ~/.wp-profiler/mu-plugin/
 * and symlinks it into the site's mu-plugins directory.
 */
export async function deployConflictTesterMuPlugin(site: Local.Site): Promise<void> {
	const canonicalDir = path.join(os.homedir(), '.wp-profiler', 'mu-plugin');
	const canonicalPath = path.join(canonicalDir, MU_PLUGIN_FILENAME);
	const source = path.join(__dirname, MU_PLUGIN_FILENAME);

	await fs.ensureDir(canonicalDir);
	if (fs.existsSync(source)) {
		await fs.copy(source, canonicalPath, { overwrite: true });
	}

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
