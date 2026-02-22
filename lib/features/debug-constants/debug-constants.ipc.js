"use strict";
/**
 * debug-constants.ipc.ts — IPC handler registration for the debug constants feature.
 *
 * This is the "wiring" layer that connects the service functions and watcher
 * to IPC channels. It registers all four async IPC listeners that the renderer
 * communicates with.
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
exports.registerDebugConstantsIpc = void 0;
const LocalMain = __importStar(require("@getflywheel/local/main"));
const types_1 = require("../../shared/types");
const debug_constants_service_1 = require("./debug-constants.service");
const debug_constants_watcher_1 = require("./debug-constants.watcher");
/**
 * Registers all IPC listeners for the debug constants feature.
 *
 * Creates a watcher manager and wires it together with the service functions.
 * After calling this function, the following IPC channels are active:
 *   - supercharged:watch-site
 *   - supercharged:unwatch-site
 *   - supercharged:get-debug-constants
 *   - supercharged:set-debug-constant
 *
 * @param deps — The service dependencies (wpCli, siteData, logger).
 */
function registerDebugConstantsIpc(deps) {
    const { wpCli, siteData, logger } = deps;
    const watcher = (0, debug_constants_watcher_1.createWatcherManager)(deps);
    /**
     * Start watching wp-config.php for a site.
     * Called by the renderer when the DebugSwitches component mounts.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.WATCH_SITE, (siteId) => __awaiter(this, void 0, void 0, function* () {
        watcher.watchSite(siteId);
    }));
    /**
     * Stop watching wp-config.php for a site.
     * Called by the renderer when the DebugSwitches component unmounts.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.UNWATCH_SITE, (siteId) => __awaiter(this, void 0, void 0, function* () {
        watcher.unwatchSite(siteId);
    }));
    /**
     * Get the current values of all debug constants.
     *
     * Implements a cache-first strategy:
     * 1. If cached and wp-config.php hasn't been modified since → return cached.
     * 2. Otherwise → fetch via WP-CLI, persist to cache, return fresh values.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.GET_DEBUG_CONSTANTS, (siteId) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        const cached = (0, debug_constants_service_1.readCache)(site);
        if ((cached === null || cached === void 0 ? void 0 : cached.debugConstants) && cached.cachedAt >= (0, debug_constants_service_1.getWpConfigMtime)(site)) {
            logger.info(`Returning cached debug constants for site ${siteId}`);
            return cached.debugConstants;
        }
        const results = yield (0, debug_constants_service_1.fetchDebugConstants)(wpCli, site);
        (0, debug_constants_service_1.writeCache)(siteData, siteId, results);
        logger.info(`Fetched and cached debug constants for site ${siteId}: ${JSON.stringify(results)}`);
        return results;
    }));
    /**
     * Set a single debug constant in wp-config.php.
     *
     * Flow:
     * 1. Mark self-writing to suppress the file watcher.
     * 2. Run `wp config set` via WP-CLI.
     * 3. Clear self-writing guard after 500ms.
     * 4. Merge the new value into the existing cache.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.SET_DEBUG_CONSTANT, (siteId, constant, value) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        watcher.markSelfWriting(siteId);
        try {
            yield (0, debug_constants_service_1.setDebugConstant)(wpCli, site, constant, value);
        }
        finally {
            watcher.clearSelfWriting(siteId);
        }
        const cached = (0, debug_constants_service_1.readCache)(site);
        const updatedCache = Object.assign(Object.assign({}, cached === null || cached === void 0 ? void 0 : cached.debugConstants), { [constant]: value });
        (0, debug_constants_service_1.writeCache)(siteData, siteId, updatedCache);
        logger.info(`Set ${constant} to ${value} for site ${siteId} and updated cache`);
        return { success: true };
    }));
}
exports.registerDebugConstantsIpc = registerDebugConstantsIpc;
//# sourceMappingURL=debug-constants.ipc.js.map