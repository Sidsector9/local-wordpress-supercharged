"use strict";
/**
 * ngrok.ipc.ts -- IPC handler registration for the ngrok feature.
 *
 * This is the "wiring" layer that connects the service functions, process
 * manager, and IPC channels. It registers all seven async IPC listeners
 * that the renderer communicates with.
 *
 * Channels:
 *   - GET_NGROK:              Read cached ngrok state (enabled + URL)
 *   - APPLY_NGROK:            Save URL to cache (no wp-config.php changes)
 *   - ENABLE_NGROK:           Enable/disable (writes/removes wp-config.php constants)
 *   - CLEAR_NGROK:            Clear URL mapping and remove constants
 *   - START_NGROK_PROCESS:    Spawn the ngrok CLI for a site
 *   - STOP_NGROK_PROCESS:     Kill the ngrok CLI for a site
 *   - GET_NGROK_PROCESS_STATUS: Query whether the tunnel is running via the agent API
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
exports.registerNgrokIpc = void 0;
const LocalMain = __importStar(require("@getflywheel/local/main"));
const types_1 = require("../../shared/types");
const ngrok_service_1 = require("./ngrok.service");
const ngrok_process_1 = require("./ngrok.process");
/**
 * Registers all ngrok-related IPC listeners on the main process.
 *
 * Called once from main.ts during addon initialization. Each listener
 * pairs with a `LocalRenderer.ipcAsync()` call in the renderer.
 *
 * @param deps -- Service dependencies injected from main.ts.
 */
function registerNgrokIpc(deps) {
    const { wpCli, siteData, logger } = deps;
    /**
     * GET_NGROK -- Returns the cached ngrok state for a site.
     *
     * Called on component mount to initialize the UI.
     * Returns { enabled: false, url: '' } if no cache exists.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.GET_NGROK, (siteId) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const site = siteData.getSite(siteId);
        const cached = (0, ngrok_service_1.readNgrokCache)(site);
        return {
            enabled: (_a = cached === null || cached === void 0 ? void 0 : cached.enabled) !== null && _a !== void 0 ? _a : false,
            url: (_b = cached === null || cached === void 0 ? void 0 : cached.url) !== null && _b !== void 0 ? _b : '',
        };
    }));
    /**
     * APPLY_NGROK -- Saves the ngrok URL to cache without touching wp-config.php.
     *
     * Called when the user clicks "Save". The URL is persisted so it survives
     * app restarts, but no wp-config.php constants are written until the user
     * clicks "Start".
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.APPLY_NGROK, (siteId, url) => __awaiter(this, void 0, void 0, function* () {
        (0, ngrok_service_1.writeNgrokCache)(siteData, siteId, { enabled: false, url });
        logger.info(`Saved ngrok URL for site ${siteId}: ${url}`);
    }));
    /**
     * ENABLE_NGROK -- Enables or disables ngrok for a site.
     *
     * When enabling:
     *   1. Resolve URL collisions (disable conflicting sites, remove their
     *      wp-config.php constants, kill their processes, notify renderer).
     *   2. Set WP_HOME and WP_SITEURL on the current site.
     *   3. Update cache with enabled: true.
     *
     * When disabling:
     *   1. Kill any running ngrok process for this site.
     *   2. Remove WP_HOME and WP_SITEURL from wp-config.php.
     *   3. Update cache with enabled: false (URL preserved for re-enabling).
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.ENABLE_NGROK, (siteId, enabled, url) => __awaiter(this, void 0, void 0, function* () {
        var _c;
        const site = siteData.getSite(siteId);
        if (enabled) {
            const conflicting = (0, ngrok_service_1.findConflictingSites)(siteData, url, siteId);
            for (const conflictId of conflicting) {
                const conflictSite = siteData.getSite(conflictId);
                const conflictNgrok = (0, ngrok_service_1.readNgrokCache)(conflictSite);
                (0, ngrok_process_1.stopNgrokProcess)(conflictId);
                yield (0, ngrok_service_1.removeNgrokConstants)(wpCli, conflictSite);
                (0, ngrok_service_1.writeNgrokCache)(siteData, conflictId, {
                    enabled: false,
                    url: (_c = conflictNgrok === null || conflictNgrok === void 0 ? void 0 : conflictNgrok.url) !== null && _c !== void 0 ? _c : '',
                });
                logger.info(`Disabled ngrok on site ${conflictId} due to URL collision with site ${siteId}`);
                LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.NGROK_CHANGED, conflictId, false);
                LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, conflictId, 'stopped');
            }
            yield (0, ngrok_service_1.setNgrokConstants)(wpCli, site, url);
            (0, ngrok_service_1.writeNgrokCache)(siteData, siteId, { enabled: true, url });
            logger.info(`Enabled ngrok for site ${siteId} with URL ${url}`);
        }
        else {
            (0, ngrok_process_1.stopNgrokProcess)(siteId);
            yield (0, ngrok_service_1.removeNgrokConstants)(wpCli, site);
            (0, ngrok_service_1.writeNgrokCache)(siteData, siteId, { enabled: false, url });
            logger.info(`Disabled ngrok for site ${siteId}`);
        }
    }));
    /**
     * CLEAR_NGROK -- Clears the ngrok URL mapping entirely.
     *
     * Kills any running process, removes wp-config.php constants if enabled,
     * and removes the ngrok key from the SiteJSON cache.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.CLEAR_NGROK, (siteId) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        const cached = (0, ngrok_service_1.readNgrokCache)(site);
        (0, ngrok_process_1.stopNgrokProcess)(siteId);
        if (cached === null || cached === void 0 ? void 0 : cached.enabled) {
            yield (0, ngrok_service_1.removeNgrokConstants)(wpCli, site);
        }
        (0, ngrok_service_1.clearNgrokCache)(siteData, siteId);
        logger.info(`Cleared ngrok mapping for site ${siteId}`);
    }));
    /**
     * START_NGROK_PROCESS -- Spawns the ngrok CLI process for a site.
     *
     * Reads the cached URL, resolves the site's domain and HTTP port,
     * and delegates to startNgrokProcess() which handles checking the
     * agent API for existing tunnels before spawning.
     *
     * On success, pushes a NGROK_PROCESS_STATUS_CHANGED event with 'running'.
     * If the process exits later (clean or error), the onExit callback pushes
     * a 'stopped' event with an optional error message.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.START_NGROK_PROCESS, (siteId) => __awaiter(this, void 0, void 0, function* () {
        var _d;
        const site = siteData.getSite(siteId);
        const cached = (0, ngrok_service_1.readNgrokCache)(site);
        if (!(cached === null || cached === void 0 ? void 0 : cached.url)) {
            throw new Error(`No ngrok URL configured for site ${siteId}`);
        }
        const siteDomain = site.domain;
        const httpPort = (_d = site.httpPort) !== null && _d !== void 0 ? _d : 80;
        yield (0, ngrok_process_1.startNgrokProcess)(siteId, cached.url, siteDomain, httpPort, (exitedSiteId, error) => {
            LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, exitedSiteId, 'stopped', error);
            if (error) {
                logger.warn(`ngrok process failed for site ${exitedSiteId}: ${error}`);
            }
            else {
                logger.info(`ngrok process exited for site ${exitedSiteId}`);
            }
        });
        LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, siteId, 'running');
        logger.info(`Started ngrok process for site ${siteId}`);
    }));
    /**
     * STOP_NGROK_PROCESS -- Kills the ngrok CLI process for a site.
     *
     * Pushes a NGROK_PROCESS_STATUS_CHANGED event with 'stopped' so
     * the renderer updates the status indicator immediately.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.STOP_NGROK_PROCESS, (siteId) => __awaiter(this, void 0, void 0, function* () {
        (0, ngrok_process_1.stopNgrokProcess)(siteId);
        LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, siteId, 'stopped');
        logger.info(`Stopped ngrok process for site ${siteId}`);
    }));
    /**
     * GET_NGROK_PROCESS_STATUS -- Returns whether the tunnel is running.
     *
     * Queries the ngrok agent API for a tunnel matching this site's URL.
     * Only reports 'running' if the site also has ngrok enabled in cache,
     * so that sites sharing the same URL don't all show "Tunnel active".
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.GET_NGROK_PROCESS_STATUS, (siteId) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        const cached = (0, ngrok_service_1.readNgrokCache)(site);
        return (0, ngrok_process_1.getNgrokProcessStatus)(cached === null || cached === void 0 ? void 0 : cached.url, cached === null || cached === void 0 ? void 0 : cached.enabled);
    }));
}
exports.registerNgrokIpc = registerNgrokIpc;
//# sourceMappingURL=ngrok.ipc.js.map