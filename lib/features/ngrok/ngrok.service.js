"use strict";
/**
 * ngrok.service.ts -- Pure functions for reading/writing WP_HOME and WP_SITEURL
 * via WP-CLI, and for managing the ngrok URL mapping in SiteJSON.
 *
 * All functions are stateless and take their dependencies as arguments,
 * making them independently testable and reusable from any context
 * (IPC handlers, hooks, direct calls from other features).
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findConflictingSites = exports.clearNgrokCache = exports.writeNgrokCache = exports.readNgrokCache = exports.removeNgrokConstants = exports.setNgrokConstants = void 0;
const types_1 = require("../../shared/types");
/**
 * Sets WP_HOME and WP_SITEURL to the given ngrok URL in wp-config.php.
 *
 * Runs `wp config set <constant> <url> --add --path=<site_path>` for each
 * constant. The `--add` flag creates the constant if it doesn't already exist.
 *
 * @param wpCli -- The WpCli service instance from Local's service container.
 * @param site  -- The Local Site object.
 * @param url   -- The ngrok URL to set (e.g. "https://foo.ngrok-free.dev").
 */
function setNgrokConstants(wpCli, site, url) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const constant of types_1.NGROK_CONSTANTS) {
            yield wpCli.run(site, ['config', 'set', constant, url, '--add', `--path=${site.path}`]);
        }
    });
}
exports.setNgrokConstants = setNgrokConstants;
/**
 * Removes WP_HOME and WP_SITEURL from wp-config.php.
 *
 * Runs `wp config delete <constant> --path=<site_path>` for each constant.
 * Silently catches errors for constants that don't exist (e.g. if the user
 * manually deleted them or they were never set).
 *
 * @param wpCli -- The WpCli service instance.
 * @param site  -- The Local Site object.
 */
function removeNgrokConstants(wpCli, site) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const constant of types_1.NGROK_CONSTANTS) {
            try {
                yield wpCli.run(site, ['config', 'delete', constant, `--path=${site.path}`]);
            }
            catch (_a) {
                // Constant may not exist
            }
        }
    });
}
exports.removeNgrokConstants = removeNgrokConstants;
/**
 * Reads the cached ngrok state from the SiteJSON object.
 *
 * The `superchargedAddon` property is a custom field written by this addon;
 * it doesn't exist in the official SiteJSON type, hence the `as any` cast.
 *
 * @param site -- The Local Site object.
 * @returns    -- The cached ngrok data, or undefined if no cache exists.
 */
function readNgrokCache(site) {
    const cache = site.superchargedAddon;
    return cache === null || cache === void 0 ? void 0 : cache.ngrok;
}
exports.readNgrokCache = readNgrokCache;
/**
 * Persists the ngrok state onto the SiteJSON object via Local's
 * `siteData.updateSite()` method.
 *
 * The data is stored under `superchargedAddon.ngrok` and survives app
 * restarts. Existing fields on `superchargedAddon` (e.g. debugConstants)
 * are preserved via spread.
 *
 * @param siteData -- The SiteDataService instance from Local's service container.
 * @param siteId   -- The unique identifier of the site to update.
 * @param ngrok    -- The ngrok state to persist (enabled flag + URL).
 */
function writeNgrokCache(siteData, siteId, ngrok) {
    const site = siteData.getSite(siteId);
    const existing = (site === null || site === void 0 ? void 0 : site.superchargedAddon) || {};
    siteData.updateSite(siteId, {
        id: siteId,
        superchargedAddon: Object.assign(Object.assign({}, existing), { ngrok }),
    });
}
exports.writeNgrokCache = writeNgrokCache;
/**
 * Removes the ngrok key from the SiteJSON cache while preserving other
 * superchargedAddon fields (e.g. debugConstants).
 *
 * Called when the user clicks "Clear" to remove the URL mapping entirely.
 *
 * @param siteData -- The SiteDataService instance.
 * @param siteId   -- The unique identifier of the site to update.
 */
function clearNgrokCache(siteData, siteId) {
    const site = siteData.getSite(siteId);
    const existing = (site === null || site === void 0 ? void 0 : site.superchargedAddon) || {};
    const { ngrok: _removed } = existing, rest = __rest(existing, ["ngrok"]);
    siteData.updateSite(siteId, {
        id: siteId,
        superchargedAddon: rest,
    });
}
exports.clearNgrokCache = clearNgrokCache;
/**
 * Finds all sites that have the same ngrok URL enabled, excluding
 * the given site.
 *
 * Used during ENABLE_NGROK to detect URL collisions: if site B tries
 * to enable the same URL that site A is already using, site A must be
 * disabled first to avoid both sites having conflicting WP_HOME values.
 *
 * @param siteData      -- The SiteDataService instance.
 * @param url           -- The ngrok URL to check for conflicts.
 * @param excludeSiteId -- The site initiating the enable (excluded from results).
 * @returns             -- Array of site IDs that have this URL enabled.
 */
function findConflictingSites(siteData, url, excludeSiteId) {
    const sites = siteData.getSites();
    const conflicting = [];
    for (const siteId of Object.keys(sites)) {
        if (siteId === excludeSiteId) {
            continue;
        }
        const ngrok = readNgrokCache(sites[siteId]);
        if ((ngrok === null || ngrok === void 0 ? void 0 : ngrok.enabled) && ngrok.url === url) {
            conflicting.push(siteId);
        }
    }
    return conflicting;
}
exports.findConflictingSites = findConflictingSites;
//# sourceMappingURL=ngrok.service.js.map