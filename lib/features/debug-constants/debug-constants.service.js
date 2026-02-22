"use strict";
/**
 * debug-constants.service.ts — Pure functions for reading and writing WordPress
 * debug constants via WP-CLI, and for reading/writing the SiteJSON cache.
 *
 * All functions are stateless and take their dependencies as arguments,
 * making them independently testable and reusable from any context
 * (IPC handlers, hooks, direct calls from other features).
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
exports.writeCache = exports.readCache = exports.setDebugConstant = exports.fetchDebugConstants = exports.getWpConfigMtime = exports.getWpConfigPath = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("../../shared/types");
/**
 * Returns the absolute filesystem path to wp-config.php for a given site.
 *
 * Local stores a site's WordPress files under `site.paths.webRoot`, which
 * typically resolves to something like:
 *   ~/Local Sites/<site-name>/app/public/
 *
 * @param site — The Local Site object.
 * @returns    — Absolute path to wp-config.php.
 */
function getWpConfigPath(site) {
    return path.join(site.paths.webRoot, 'wp-config.php');
}
exports.getWpConfigPath = getWpConfigPath;
/**
 * Returns the last-modified time (in milliseconds) of wp-config.php for a site.
 *
 * Used for cache invalidation: if the file's mtime is newer than
 * `SuperchargedCache.cachedAt`, the cache is considered stale.
 *
 * Uses `fs.statSync` because it's a single synchronous stat call (~0.1ms),
 * which is far cheaper than spawning three WP-CLI processes.
 *
 * @param site — The Local Site object.
 * @returns    — The file's mtimeMs, or 0 if the file doesn't exist or can't be read.
 */
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
 * Fetches the current values of all three debug constants from wp-config.php
 * by running `wp config get <constant> --path=<site_path>` for each one.
 *
 * WordPress stores these as PHP constants via `define()`. The WP-CLI `config get`
 * command reads the raw PHP value:
 *   - `define('WP_DEBUG', true)`  → WP-CLI returns "1"
 *   - `define('WP_DEBUG', false)` → WP-CLI returns "" (empty string)
 *   - Constant not defined        → WP-CLI throws / returns null
 *
 * Each constant is evaluated as a boolean:
 *   - "1" or "true" (case-insensitive) → true
 *   - Anything else (empty, null, error) → false
 *
 * @param wpCli — The WpCli service instance from Local's service container.
 * @param site  — The Local Site object.
 * @returns     — A DebugConstantsMap mapping each constant name to its boolean value.
 */
function fetchDebugConstants(wpCli, site) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        for (const constant of types_1.DEBUG_CONSTANTS) {
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
exports.fetchDebugConstants = fetchDebugConstants;
/**
 * Sets a single debug constant in wp-config.php via WP-CLI.
 *
 * Runs: `wp config set <constant> true|false --raw --add --path=<site_path>`
 *   - `--raw` writes the value as a raw PHP expression (true/false without quotes).
 *   - `--add` creates the constant if it doesn't already exist.
 *
 * @param wpCli    — The WpCli service instance.
 * @param site     — The Local Site object.
 * @param constant — The constant name (e.g. "WP_DEBUG").
 * @param value    — The new boolean value to set.
 */
function setDebugConstant(wpCli, site, constant, value) {
    return __awaiter(this, void 0, void 0, function* () {
        const wpValue = value ? 'true' : 'false';
        yield wpCli.run(site, ['config', 'set', constant, wpValue, '--raw', '--add', `--path=${site.path}`]);
    });
}
exports.setDebugConstant = setDebugConstant;
/**
 * Reads the cached debug constants from the SiteJSON object.
 *
 * The `superchargedAddon` property is a custom field written by this addon;
 * it doesn't exist in the official SiteJSON type, hence the `as any` cast.
 *
 * @param site — The Local Site object.
 * @returns    — The cached data, or undefined if no cache exists.
 */
function readCache(site) {
    return site.superchargedAddon;
}
exports.readCache = readCache;
/**
 * Persists the debug constant cache onto the SiteJSON object via Local's
 * `siteData.updateSite()` method.
 *
 * The data is stored under `superchargedAddon` and survives app restarts.
 * The `cachedAt` timestamp is set to `Date.now()` so that future reads can
 * compare it against wp-config.php's mtime for staleness detection.
 *
 * @param siteData — The SiteDataService instance from Local's service container.
 * @param siteId   — The unique identifier of the site to update.
 * @param cache    — The debug constant values to persist.
 */
function writeCache(siteData, siteId, cache) {
    siteData.updateSite(siteId, {
        id: siteId,
        superchargedAddon: {
            debugConstants: cache,
            cachedAt: Date.now(),
        },
    });
}
exports.writeCache = writeCache;
//# sourceMappingURL=debug-constants.service.js.map