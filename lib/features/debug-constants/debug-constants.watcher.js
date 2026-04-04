"use strict";
/**
 * debug-constants.watcher.ts -- File watcher lifecycle for wp-config.php.
 *
 * Uses a factory pattern so the stateful Maps/Sets are encapsulated.
 * The selfWriting guard suppresses the watcher during addon-initiated writes.
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
exports.createWatcherManager = void 0;
const fs = __importStar(require("fs"));
const LocalMain = __importStar(require("@getflywheel/local/main"));
const types_1 = require("../../shared/types");
const debug_constants_service_1 = require("./debug-constants.service");
function createWatcherManager(deps) {
    const { wpCli, siteData, logger } = deps;
    const watchers = new Map();
    const selfWriting = new Set();
    function watchSite(siteId) {
        if (watchers.has(siteId)) {
            return;
        }
        const site = siteData.getSite(siteId);
        const configPath = (0, debug_constants_service_1.getWpConfigPath)(site);
        try {
            const watcher = fs.watch(configPath, (eventType) => __awaiter(this, void 0, void 0, function* () {
                if (eventType !== 'change' || selfWriting.has(siteId)) {
                    return;
                }
                logger.info(`wp-config.php changed externally for site ${siteId}, refreshing`);
                const freshSite = siteData.getSite(siteId);
                const results = yield (0, debug_constants_service_1.fetchDebugConstants)(wpCli, freshSite);
                (0, debug_constants_service_1.writeCache)(siteData, siteId, results);
                LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.DEBUG_CONSTANTS_CHANGED, siteId, results);
            }));
            watchers.set(siteId, watcher);
        }
        catch (e) {
            logger.warn(`Could not watch wp-config.php for site ${siteId}: ${e}`);
        }
    }
    function unwatchSite(siteId) {
        const watcher = watchers.get(siteId);
        if (watcher) {
            watcher.close();
            watchers.delete(siteId);
        }
    }
    function markSelfWriting(siteId) {
        selfWriting.add(siteId);
    }
    function clearSelfWriting(siteId, delayMs = 500) {
        setTimeout(() => selfWriting.delete(siteId), delayMs);
    }
    return { watchSite, unwatchSite, markSelfWriting, clearSelfWriting };
}
exports.createWatcherManager = createWatcherManager;
//# sourceMappingURL=debug-constants.watcher.js.map