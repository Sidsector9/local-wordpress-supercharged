"use strict";
/**
 * ngrok.service.ts -- Pure functions for reading/writing WP_HOME and WP_SITEURL
 * via WP-CLI, and for managing the ngrok URL mapping in SiteJSON.
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
function setNgrokConstants(wpCli, site, url) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const constant of types_1.NGROK_CONSTANTS) {
            yield wpCli.run(site, ['config', 'set', constant, url, '--add', `--path=${site.path}`]);
        }
    });
}
exports.setNgrokConstants = setNgrokConstants;
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
function readNgrokCache(site) {
    const cache = site.superchargedAddon;
    return cache === null || cache === void 0 ? void 0 : cache.ngrok;
}
exports.readNgrokCache = readNgrokCache;
function writeNgrokCache(siteData, siteId, ngrok) {
    const site = siteData.getSite(siteId);
    const existing = (site === null || site === void 0 ? void 0 : site.superchargedAddon) || {};
    siteData.updateSite(siteId, {
        id: siteId,
        superchargedAddon: Object.assign(Object.assign({}, existing), { ngrok }),
    });
}
exports.writeNgrokCache = writeNgrokCache;
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
/** Finds all sites that have the same ngrok URL enabled, excluding the given site. */
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