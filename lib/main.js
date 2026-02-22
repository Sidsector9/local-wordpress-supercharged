"use strict";
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const LocalMain = __importStar(require("@getflywheel/local/main"));
const DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY'];
function getWpConfigPath(site) {
    return path.join(site.paths.webRoot, 'wp-config.php');
}
function getWpConfigMtime(site) {
    try {
        return fs.statSync(getWpConfigPath(site)).mtimeMs;
    }
    catch (_a) {
        return 0;
    }
}
function fetchDebugConstants(wpCli, site) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        for (const constant of DEBUG_CONSTANTS) {
            try {
                const value = yield wpCli.run(site, ['config', 'get', constant, `--path=${site.path}`], { ignoreErrors: true });
                results[constant] = (value === null || value === void 0 ? void 0 : value.trim()) === '1' || (value === null || value === void 0 ? void 0 : value.trim().toLowerCase()) === 'true';
            }
            catch (e) {
                results[constant] = false;
            }
        }
        return results;
    });
}
function updateCache(siteData, siteId, cache) {
    siteData.updateSite(siteId, {
        id: siteId,
        superchargedAddon: {
            debugConstants: cache,
            cachedAt: Date.now(),
        },
    });
}
function default_1(context) {
    const { wpCli, siteData, localLogger } = LocalMain.getServiceContainer().cradle;
    const logger = localLogger.child({
        thread: 'main',
        addon: 'wordpress-supercharged',
    });
    const watchers = new Map();
    const selfWriting = new Set();
    function watchSite(siteId) {
        if (watchers.has(siteId)) {
            return;
        }
        const site = siteData.getSite(siteId);
        const configPath = getWpConfigPath(site);
        try {
            const watcher = fs.watch(configPath, (eventType) => __awaiter(this, void 0, void 0, function* () {
                if (eventType !== 'change') {
                    return;
                }
                if (selfWriting.has(siteId)) {
                    return;
                }
                logger.info(`wp-config.php changed externally for site ${siteId}, refreshing`);
                const freshSite = siteData.getSite(siteId);
                const results = yield fetchDebugConstants(wpCli, freshSite);
                updateCache(siteData, siteId, results);
                LocalMain.sendIPCEvent('supercharged:debug-constants-changed', siteId, results);
            }));
            watchers.set(siteId, watcher);
        }
        catch (e) {
            logger.warn(`Could not watch wp-config.php for site ${siteId}: ${e}`);
        }
    }
    LocalMain.addIpcAsyncListener('supercharged:watch-site', (siteId) => __awaiter(this, void 0, void 0, function* () {
        watchSite(siteId);
    }));
    LocalMain.addIpcAsyncListener('supercharged:unwatch-site', (siteId) => __awaiter(this, void 0, void 0, function* () {
        const watcher = watchers.get(siteId);
        if (watcher) {
            watcher.close();
            watchers.delete(siteId);
        }
    }));
    LocalMain.addIpcAsyncListener('supercharged:get-debug-constants', (siteId) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        const cached = site.superchargedAddon;
        if ((cached === null || cached === void 0 ? void 0 : cached.debugConstants) && cached.cachedAt >= getWpConfigMtime(site)) {
            logger.info(`Returning cached debug constants for site ${siteId}`);
            return cached.debugConstants;
        }
        const results = yield fetchDebugConstants(wpCli, site);
        updateCache(siteData, siteId, results);
        logger.info(`Fetched and cached debug constants for site ${siteId}: ${JSON.stringify(results)}`);
        return results;
    }));
    LocalMain.addIpcAsyncListener('supercharged:set-debug-constant', (siteId, constant, value) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        const wpValue = value ? 'true' : 'false';
        selfWriting.add(siteId);
        try {
            yield wpCli.run(site, ['config', 'set', constant, wpValue, '--raw', '--add', `--path=${site.path}`]);
        }
        finally {
            setTimeout(() => selfWriting.delete(siteId), 500);
        }
        const cached = site.superchargedAddon;
        const updatedCache = Object.assign(Object.assign({}, cached === null || cached === void 0 ? void 0 : cached.debugConstants), { [constant]: value });
        updateCache(siteData, siteId, updatedCache);
        logger.info(`Set ${constant} to ${wpValue} for site ${siteId} and updated cache`);
        return { success: true };
    }));
}
exports.default = default_1;
//# sourceMappingURL=main.js.map