"use strict";
/**
 * conflict-test.service.ts -- Pure functions for reading the plugin list,
 * managing conflict test overrides, and deploying the mu-plugin.
 *
 * All functions are stateless and take their dependencies as arguments.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployConflictTesterMuPlugin = exports.clearOverrides = exports.writeOverride = exports.readOverrides = exports.getDependentPlugins = exports.getPluginDependencies = exports.getPluginList = exports.getOverridesPath = void 0;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
/** Name of the override config file in wp-content. */
const OVERRIDES_FILENAME = 'conflict-test-overrides.json';
/** Name of the mu-plugin file. */
const MU_PLUGIN_FILENAME = 'wp-conflict-tester.php';
/**
 * Returns the path to the overrides JSON file for a site.
 */
function getOverridesPath(site) {
    return path.join(site.paths.webRoot, 'wp-content', OVERRIDES_FILENAME);
}
exports.getOverridesPath = getOverridesPath;
/**
 * Fetches the list of plugins (active + inactive) via WP-CLI.
 * Excludes mu-plugins.
 */
function getPluginList(wpCli, site) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield wpCli.run(site, [
            'plugin', 'list',
            '--status=active,inactive',
            '--format=json',
            '--fields=name,status,version,file',
        ]);
        if (!result)
            return [];
        try {
            return JSON.parse(result);
        }
        catch (_a) {
            return [];
        }
    });
}
exports.getPluginList = getPluginList;
/**
 * Fetches plugin dependency data via WP-CLI.
 * Returns a map of plugin file -> comma-separated required plugin slugs.
 */
function getPluginDependencies(wpCli, site) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield wpCli.run(site, [
                'eval',
                'foreach(get_plugins() as $f=>$d) if(!empty($d["RequiresPlugins"])) echo json_encode([$f,$d["RequiresPlugins"]]).PHP_EOL;',
            ]);
            if (!result)
                return {};
            const deps = {};
            for (const line of result.trim().split('\n')) {
                if (!line.trim())
                    continue;
                try {
                    const [file, requires] = JSON.parse(line);
                    deps[file] = requires;
                }
                catch (_a) {
                    // skip malformed lines
                }
            }
            return deps;
        }
        catch (_b) {
            return {};
        }
    });
}
exports.getPluginDependencies = getPluginDependencies;
/**
 * Given a plugin being deactivated, returns the list of dependent plugins
 * that should also be deactivated (cascade).
 *
 * @param pluginFile - The plugin file being deactivated (e.g. "woocommerce/woocommerce.php")
 * @param deps - The dependency map from getPluginDependencies
 * @param plugins - The full plugin list
 * @returns Array of plugin files that depend on the deactivated plugin
 */
function getDependentPlugins(pluginFile, deps, plugins) {
    // Extract the slug from the plugin file (e.g. "woocommerce" from "woocommerce/woocommerce.php")
    const slug = pluginFile.split('/')[0];
    const dependents = [];
    for (const [file, requires] of Object.entries(deps)) {
        const requiredSlugs = requires.split(',').map(s => s.trim());
        if (requiredSlugs.includes(slug)) {
            dependents.push(file);
        }
    }
    return dependents;
}
exports.getDependentPlugins = getDependentPlugins;
/**
 * Reads the current conflict test overrides from the site's config file.
 * Returns an empty overrides object if the file doesn't exist.
 */
function readOverrides(site) {
    const filePath = getOverridesPath(site);
    if (!fs.existsSync(filePath)) {
        return { overrides: {} };
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    }
    catch (_a) {
        return { overrides: {} };
    }
}
exports.readOverrides = readOverrides;
/**
 * Sets a single plugin override. If the override matches the plugin's
 * DB status, the entry is removed (no-op override).
 */
function writeOverride(site, pluginBasename, active, dbStatus) {
    const filePath = getOverridesPath(site);
    const config = readOverrides(site);
    // If the override matches DB state, remove it (no override needed)
    const matchesDb = (active && dbStatus === 'active') || (!active && dbStatus === 'inactive');
    if (matchesDb) {
        delete config.overrides[pluginBasename];
    }
    else {
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
exports.writeOverride = writeOverride;
/**
 * Clears all conflict test overrides by deleting the config file.
 */
function clearOverrides(site) {
    const filePath = getOverridesPath(site);
    if (fs.existsSync(filePath)) {
        fs.removeSync(filePath);
    }
}
exports.clearOverrides = clearOverrides;
/**
 * Deploys the conflict tester mu-plugin to the canonical location
 * and symlinks it into the site's mu-plugins directory.
 */
function deployConflictTesterMuPlugin(site) {
    return __awaiter(this, void 0, void 0, function* () {
        const canonicalDir = path.join(os.homedir(), '.wp-profiler', 'mu-plugin');
        const canonicalPath = path.join(canonicalDir, MU_PLUGIN_FILENAME);
        const source = path.join(__dirname, MU_PLUGIN_FILENAME);
        // Write canonical copy
        yield fs.ensureDir(canonicalDir);
        if (fs.existsSync(source)) {
            yield fs.copy(source, canonicalPath, { overwrite: true });
        }
        // Symlink into site
        const siteMuPluginsDir = path.join(site.paths.webRoot, 'wp-content', 'mu-plugins');
        yield fs.ensureDir(siteMuPluginsDir);
        const symlinkPath = path.join(siteMuPluginsDir, MU_PLUGIN_FILENAME);
        if (fs.existsSync(symlinkPath)) {
            const stat = yield fs.lstat(symlinkPath);
            if (stat.isSymbolicLink()) {
                const target = yield fs.readlink(symlinkPath);
                if (target === canonicalPath)
                    return;
                yield fs.remove(symlinkPath);
            }
            else {
                return; // Regular file, don't overwrite
            }
        }
        yield fs.ensureSymlink(canonicalPath, symlinkPath);
    });
}
exports.deployConflictTesterMuPlugin = deployConflictTesterMuPlugin;
//# sourceMappingURL=conflict-test.service.js.map