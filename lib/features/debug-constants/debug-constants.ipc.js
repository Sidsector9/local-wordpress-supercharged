"use strict";
/**
 * debug-constants.ipc.ts -- IPC handler registration for the debug constants feature.
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
function registerDebugConstantsIpc(deps) {
    const { wpCli, siteData, logger } = deps;
    const watcher = (0, debug_constants_watcher_1.createWatcherManager)(deps);
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.WATCH_SITE, (siteId) => __awaiter(this, void 0, void 0, function* () {
        watcher.watchSite(siteId);
    }));
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.UNWATCH_SITE, (siteId) => __awaiter(this, void 0, void 0, function* () {
        watcher.unwatchSite(siteId);
    }));
    // Cache-first: return cached if wp-config.php hasn't changed, otherwise re-fetch via WP-CLI.
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.GET_DEBUG_CONSTANTS, (siteId) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        const cached = (0, debug_constants_service_1.readCache)(site);
        if ((cached === null || cached === void 0 ? void 0 : cached.debugConstants) && cached.cacheVersion === types_1.CACHE_VERSION && cached.cachedAt >= (0, debug_constants_service_1.getWpConfigMtime)(site)) {
            logger.info(`Returning cached debug constants for site ${siteId}`);
            return cached.debugConstants;
        }
        const results = yield (0, debug_constants_service_1.fetchDebugConstants)(wpCli, site);
        (0, debug_constants_service_1.writeCache)(siteData, siteId, results);
        logger.info(`Fetched and cached debug constants for site ${siteId}: ${JSON.stringify(results)}`);
        return results;
    }));
    /**
     * Special handling for WP_DEBUG_DISPLAY:
     *   - Setting to true -> deletes from file (WP default is true).
     *   - Setting to false -> writes to file (overrides WP default).
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.SET_DEBUG_CONSTANT, (siteId, constant, value) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        watcher.markSelfWriting(siteId);
        try {
            if (constant === 'WP_DEBUG_DISPLAY' && value === true) {
                const defined = yield (0, debug_constants_service_1.isConstantDefined)(wpCli, site, constant);
                if (defined) {
                    yield (0, debug_constants_service_1.deleteConstant)(wpCli, site, constant);
                }
            }
            else {
                yield (0, debug_constants_service_1.setDebugConstant)(wpCli, site, constant, value);
            }
        }
        finally {
            watcher.clearSelfWriting(siteId);
        }
        const results = yield (0, debug_constants_service_1.fetchDebugConstants)(wpCli, site);
        (0, debug_constants_service_1.writeCache)(siteData, siteId, results);
        logger.info(`Set ${constant} to ${value} for site ${siteId} and updated cache`);
        return { success: true, constants: results };
    }));
}
exports.registerDebugConstantsIpc = registerDebugConstantsIpc;
//# sourceMappingURL=debug-constants.ipc.js.map