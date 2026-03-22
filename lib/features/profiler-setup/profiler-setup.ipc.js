"use strict";
/**
 * profiler-setup.ipc.ts -- IPC handler registration for the profiler setup feature.
 *
 * This is the "wiring" layer that connects the service functions, lightning
 * services, and IPC channels. It registers two async IPC listeners that the
 * renderer communicates with.
 *
 * Channels:
 *   - GET_PROFILER_STATUS:  Check what profiler tools are installed
 *   - RUN_PROFILER_SETUP:   Run the full setup sequence (xhprof + k6)
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
exports.registerProfilerSetupIpc = void 0;
const path = __importStar(require("path"));
const Local = __importStar(require("@getflywheel/local"));
const LocalMain = __importStar(require("@getflywheel/local/main"));
const types_1 = require("../../shared/types");
const profiler_setup_service_1 = require("./profiler-setup.service");
/**
 * Extracts PHP binary paths from a LightningService instance.
 *
 * If phpize or php-config are not in the bin dictionary, we look for them
 * in the same directory as the php binary.
 */
function getPhpBins(phpService) {
    var _a, _b, _c, _d;
    const bin = (_a = phpService.bin) !== null && _a !== void 0 ? _a : {};
    const phpBin = (_b = bin['php']) !== null && _b !== void 0 ? _b : 'php';
    const phpDir = path.dirname(phpBin);
    return {
        php: phpBin,
        phpize: (_c = bin['phpize']) !== null && _c !== void 0 ? _c : path.join(phpDir, 'phpize'),
        phpConfig: (_d = bin['php-config']) !== null && _d !== void 0 ? _d : path.join(phpDir, 'php-config'),
    };
}
/**
 * Registers all profiler-setup-related IPC listeners on the main process.
 *
 * Called once from main.ts during addon initialization. Each listener
 * pairs with a `LocalRenderer.ipcAsync()` call in the renderer.
 *
 * @param deps -- Service dependencies injected from main.ts.
 */
function registerProfilerSetupIpc(deps) {
    const { siteData, lightningServices, siteProcessManager, logger } = deps;
    /**
     * GET_PROFILER_STATUS -- Returns the installation status of all
     * profiler tools for a site.
     *
     * Called on component mount to determine whether to show the
     * "Setup" button or the "Ready" indicator.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.GET_PROFILER_STATUS, (siteId) => __awaiter(this, void 0, void 0, function* () {
        const site = siteData.getSite(siteId);
        const phpService = lightningServices.getSiteServiceByRole(site, Local.SiteServiceRole.PHP);
        if (!phpService) {
            return {
                xhprof: { status: 'error', error: 'PHP service not found for this site' },
                k6: (yield (0, profiler_setup_service_1.checkK6Installed)()),
                muPlugin: { status: 'missing' },
            };
        }
        const { phpize } = getPhpBins(phpService);
        const phpPrefix = path.dirname(path.dirname(phpize));
        const extDir = yield (0, profiler_setup_service_1.findExtensionDir)(phpPrefix);
        return (0, profiler_setup_service_1.getProfilerStatus)(extDir, site, phpService.binVersion);
    }));
    /**
     * RUN_PROFILER_SETUP -- Runs the full profiler setup sequence.
     *
     * 1. xhprof: check cache -> clone source -> compile -> write ini -> restart PHP -> verify
     * 2. k6: check installed -> download -> verify
     *
     * xhprof and k6 are independent -- one failing does not block the other.
     * Progress is streamed to the renderer via PROFILER_SETUP_LOG push events.
     */
    LocalMain.addIpcAsyncListener(types_1.IPC_CHANNELS.RUN_PROFILER_SETUP, (siteId) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const site = siteData.getSite(siteId);
        const phpService = lightningServices.getSiteServiceByRole(site, Local.SiteServiceRole.PHP);
        const onLog = (msg) => {
            logger.info(msg);
            LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.PROFILER_SETUP_LOG, siteId, msg);
        };
        let xhprofResult = { status: 'missing' };
        let k6Result = { status: 'missing' };
        let muPluginResult = { status: 'missing' };
        // -- xhprof setup --
        if (!phpService) {
            xhprofResult = { status: 'error', error: 'PHP service not found for this site' };
            onLog('Error: PHP service not found');
        }
        else if (process.platform === 'win32') {
            xhprofResult = { status: 'error', error: 'xhprof compilation requires macOS or Linux' };
            onLog('Skipping xhprof: compilation not supported on Windows');
        }
        else {
            const phpVersion = phpService.binVersion;
            const { php, phpize, phpConfig } = getPhpBins(phpService);
            const phpPrefix = path.dirname(path.dirname(phpize));
            const env = Object.assign(Object.assign({}, process.env), { PATH: `${(_a = phpService.$PATH) !== null && _a !== void 0 ? _a : ''}${path.delimiter}${(_b = process.env.PATH) !== null && _b !== void 0 ? _b : ''}` });
            try {
                // Step 1: Compile if not cached
                if ((0, profiler_setup_service_1.checkXhprofCached)(phpVersion)) {
                    onLog(`xhprof.so already cached for PHP ${phpVersion}`);
                }
                else {
                    yield (0, profiler_setup_service_1.ensureXhprofSource)(onLog);
                    yield (0, profiler_setup_service_1.compileXhprof)(phpVersion, phpize, phpConfig, env, onLog);
                }
                // Step 2: Copy .so to extension dir and update php.ini.hbs
                const extDir = yield (0, profiler_setup_service_1.findExtensionDir)(phpPrefix);
                if (!extDir) {
                    throw new Error('Could not find PHP extension directory');
                }
                yield (0, profiler_setup_service_1.installXhprofExtension)(site, phpVersion, extDir, onLog);
                // Step 3: Restart PHP to load the extension
                onLog('Restarting PHP service...');
                yield siteProcessManager.restartSiteService(site, 'php');
                onLog('PHP service restarted');
                // Step 4: Verify
                xhprofResult = yield (0, profiler_setup_service_1.verifyXhprofInstalled)(extDir, site);
                if (xhprofResult.status === 'ready') {
                    onLog('xhprof installed and configured');
                }
                else {
                    onLog(`xhprof verification failed: ${xhprofResult.error}`);
                }
            }
            catch (e) {
                xhprofResult = { status: 'error', error: e.message };
                onLog(`xhprof setup failed: ${e.message}`);
                logger.warn(`xhprof setup failed for site ${siteId}: ${e.message}`);
            }
        }
        // -- k6 setup --
        try {
            const k6Check = yield (0, profiler_setup_service_1.checkK6Installed)();
            if (k6Check.status === 'ready') {
                onLog(`k6 already installed (${k6Check.version})`);
                k6Result = k6Check;
            }
            else {
                yield (0, profiler_setup_service_1.downloadAndInstallK6)(onLog);
                k6Result = yield (0, profiler_setup_service_1.checkK6Installed)();
                if (k6Result.status === 'ready') {
                    onLog(`k6 ${k6Result.version} installed`);
                }
                else {
                    onLog(`k6 verification failed: ${k6Result.error}`);
                }
            }
        }
        catch (e) {
            k6Result = { status: 'error', error: e.message };
            onLog(`k6 setup failed: ${e.message}`);
            logger.warn(`k6 setup failed for site ${siteId}: ${e.message}`);
        }
        // -- mu-plugin setup --
        try {
            yield (0, profiler_setup_service_1.deployMuPlugin)(site, onLog);
            muPluginResult = { status: 'ready', version: 'installed' };
        }
        catch (e) {
            muPluginResult = { status: 'error', error: e.message };
            onLog(`mu-plugin setup failed: ${e.message}`);
            logger.warn(`mu-plugin setup failed for site ${siteId}: ${e.message}`);
        }
        // -- CLI command setup --
        try {
            yield (0, profiler_setup_service_1.deployCliCommand)(onLog);
        }
        catch (e) {
            onLog(`CLI setup warning: ${e.message}`);
            logger.warn(`CLI setup failed for site ${siteId}: ${e.message}`);
        }
        const status = {
            xhprof: xhprofResult,
            k6: k6Result,
            muPlugin: muPluginResult,
        };
        // Persist setup state
        const phpVersion = phpService === null || phpService === void 0 ? void 0 : phpService.binVersion;
        const allReady = xhprofResult.status === 'ready'
            && k6Result.status === 'ready'
            && muPluginResult.status === 'ready';
        (0, profiler_setup_service_1.writeProfilerCache)(siteData, siteId, {
            setupCompleted: allReady,
            phpVersion,
        });
        LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.PROFILER_SETUP_COMPLETED, siteId, status);
        return status;
    }));
}
exports.registerProfilerSetupIpc = registerProfilerSetupIpc;
//# sourceMappingURL=profiler-setup.ipc.js.map