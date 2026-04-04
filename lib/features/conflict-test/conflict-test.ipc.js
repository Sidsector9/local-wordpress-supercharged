"use strict";
/**
 * conflict-test.ipc.ts -- IPC handler registration for the conflict testing feature.
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
exports.registerConflictTestIpc = void 0;
const LocalMain = __importStar(require("@getflywheel/local/main"));
const types_1 = require("../../shared/types");
const conflict_test_service_1 = require("./conflict-test.service");
function registerConflictTestIpc(deps) {
    const { wpCli, siteData, logger } = deps;
    // Per-site caches to avoid repeated WP-CLI calls
    const depsCache = {};
    const pluginsCache = {};
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.GET_PLUGIN_LIST, (siteId) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        try {
            const [plugins, dependencies] = yield Promise.all([
                (0, conflict_test_service_1.getPluginList)(wpCli, site),
                (0, conflict_test_service_1.getPluginDependencies)(wpCli, site),
            ]);
            depsCache[siteId] = dependencies;
            pluginsCache[siteId] = plugins;
            return { plugins, dependencies };
        }
        catch (e) {
            logger.warn(`Failed to get plugin list for site ${siteId}: ${e.message}`);
            return { plugins: [], dependencies: {} };
        }
    }));
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.GET_CONFLICT_OVERRIDES, (siteId) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        try {
            yield (0, conflict_test_service_1.deployConflictTesterMuPlugin)(site);
        }
        catch (e) {
            logger.warn(`Failed to deploy conflict tester mu-plugin: ${e.message}`);
        }
        return (0, conflict_test_service_1.readOverrides)(site);
    }));
    // SET_CONFLICT_OVERRIDE -- Sets a plugin override with cascade.
    // Deactivating cascades down to dependents; activating cascades up to requirements.
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.SET_CONFLICT_OVERRIDE, (siteId, pluginFile, active, dbStatus) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        const deps = depsCache[siteId] || {};
        const plugins = pluginsCache[siteId] || [];
        (0, conflict_test_service_1.writeOverride)(site, pluginFile, active, dbStatus);
        logger.info(`Conflict override: ${pluginFile} -> ${active ? 'active' : 'inactive'} (DB: ${dbStatus})`);
        if (!active) {
            const dependents = (0, conflict_test_service_1.getDependentPlugins)(pluginFile, deps, plugins);
            for (const depFile of dependents) {
                const depPlugin = plugins.find(p => p.file === depFile);
                if (depPlugin) {
                    (0, conflict_test_service_1.writeOverride)(site, depFile, false, depPlugin.status);
                    logger.info(`Cascade deactivation: ${depFile} (depends on ${pluginFile})`);
                }
            }
        }
        else {
            const requires = deps[pluginFile];
            if (requires) {
                const requiredSlugs = requires.split(',').map(s => s.trim());
                for (const slug of requiredSlugs) {
                    const reqPlugin = plugins.find(p => p.file.startsWith(slug + '/'));
                    if (reqPlugin) {
                        (0, conflict_test_service_1.writeOverride)(site, reqPlugin.file, true, reqPlugin.status);
                        logger.info(`Cascade activation: ${reqPlugin.file} (required by ${pluginFile})`);
                    }
                }
            }
        }
        return (0, conflict_test_service_1.readOverrides)(site);
    }));
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.CLEAR_CONFLICT_OVERRIDES, (siteId) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        (0, conflict_test_service_1.clearOverrides)(site);
        logger.info(`Cleared all conflict overrides for site ${siteId}`);
        return (0, conflict_test_service_1.readOverrides)(site);
    }));
}
exports.registerConflictTestIpc = registerConflictTestIpc;
//# sourceMappingURL=conflict-test.ipc.js.map