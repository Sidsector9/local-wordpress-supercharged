"use strict";
/**
 * debug-constants.service.ts -- Pure functions for reading/writing WordPress
 * debug constants via WP-CLI, and for reading/writing the SiteJSON cache.
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
exports.writeCache = exports.readCache = exports.deleteConstant = exports.isConstantDefined = exports.setDebugConstant = exports.fetchDebugConstants = exports.getWpConfigMtime = exports.getWpConfigPath = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("../../shared/types");
function getWpConfigPath(site) {
    return path.join(site.paths.webRoot, 'wp-config.php');
}
exports.getWpConfigPath = getWpConfigPath;
/** Returns wp-config.php mtime in ms, or 0 if unreadable. Used for cache invalidation. */
function getWpConfigMtime(site) {
    try {
        return fs.statSync(getWpConfigPath(site)).mtimeMs;
    }
    catch (_a) {
        return 0;
    }
}
exports.getWpConfigMtime = getWpConfigMtime;
/**
 * Fetches current values of all debug constants via WP-CLI `config get`.
 *
 * WP-CLI returns "1" for true, "" for false, throws for undefined.
 * Falls back to WP_DEFAULTS when a constant is not defined.
 */
function fetchDebugConstants(wpCli, site) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        for (const constant of types_1.DEBUG_CONSTANTS) {
            try {
                const value = yield wpCli.run(site, ['config', 'get', constant, `--path=${site.path}`]);
                results[constant] = (value === null || value === void 0 ? void 0 : value.trim()) === '1' || (value === null || value === void 0 ? void 0 : value.trim().toLowerCase()) === 'true';
            }
            catch (e) {
                results[constant] = types_1.WP_DEFAULTS[constant];
            }
        }
        return results;
    });
}
exports.fetchDebugConstants = fetchDebugConstants;
function setDebugConstant(wpCli, site, constant, value) {
    return __awaiter(this, void 0, void 0, function* () {
        const wpValue = value ? 'true' : 'false';
        yield wpCli.run(site, ['config', 'set', constant, wpValue, '--raw', '--add', `--path=${site.path}`]);
    });
}
exports.setDebugConstant = setDebugConstant;
function isConstantDefined(wpCli, site, constant) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield wpCli.run(site, ['config', 'get', constant, `--path=${site.path}`]);
            return true;
        }
        catch (_a) {
            return false;
        }
    });
}
exports.isConstantDefined = isConstantDefined;
function deleteConstant(wpCli, site, constant) {
    return __awaiter(this, void 0, void 0, function* () {
        yield wpCli.run(site, ['config', 'delete', constant, `--path=${site.path}`]);
    });
}
exports.deleteConstant = deleteConstant;
function readCache(site) {
    return site.superchargedAddon;
}
exports.readCache = readCache;
function writeCache(siteData, siteId, cache) {
    const site = siteData.getSite(siteId);
    const existing = (site === null || site === void 0 ? void 0 : site.superchargedAddon) || {};
    siteData.updateSite(siteId, {
        id: siteId,
        superchargedAddon: Object.assign(Object.assign({}, existing), { debugConstants: cache, cachedAt: Date.now(), cacheVersion: types_1.CACHE_VERSION }),
    });
}
exports.writeCache = writeCache;
//# sourceMappingURL=debug-constants.service.js.map