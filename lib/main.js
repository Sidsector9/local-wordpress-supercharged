"use strict";
/**
 * main.ts -- Main Process Entry Point for the WordPress Supercharged Addon
 *
 * This is a thin wiring shell. It extracts dependencies from Local's service
 * container and delegates to feature-specific registration functions.
 *
 * To add a new feature, import its registration function and call it here.
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
Object.defineProperty(exports, "__esModule", { value: true });
const LocalMain = __importStar(require("@getflywheel/local/main"));
const types_1 = require("./shared/types");
const debug_constants_ipc_1 = require("./features/debug-constants/debug-constants.ipc");
const ngrok_ipc_1 = require("./features/ngrok/ngrok.ipc");
const profiler_setup_ipc_1 = require("./features/profiler-setup/profiler-setup.ipc");
const conflict_test_ipc_1 = require("./features/conflict-test/conflict-test.ipc");
const ngrok_process_1 = require("./features/ngrok/ngrok.process");
const ngrok_service_1 = require("./features/ngrok/ngrok.service");
function default_1(context) {
    const { wpCli, siteData, localLogger, lightningServices, siteProcessManager } = LocalMain.getServiceContainer().cradle;
    const logger = localLogger.child({
        thread: 'main',
        addon: 'wordpress-supercharged',
    });
    (0, debug_constants_ipc_1.registerDebugConstantsIpc)({ wpCli, siteData, logger });
    (0, ngrok_ipc_1.registerNgrokIpc)({ wpCli, siteData, logger });
    if (types_1.FEATURE_FLAGS.PROFILER) {
        (0, profiler_setup_ipc_1.registerProfilerSetupIpc)({ siteData, lightningServices, siteProcessManager, logger });
    }
    (0, conflict_test_ipc_1.registerConflictTestIpc)({ wpCli, siteData, logger });
    context.hooks.addAction('siteStopped', (site) => {
        const cached = (0, ngrok_service_1.readNgrokCache)(site);
        if (cached === null || cached === void 0 ? void 0 : cached.enabled) {
            (0, ngrok_process_1.stopNgrokProcess)(site.id);
            (0, ngrok_service_1.writeNgrokCache)(siteData, site.id, { enabled: false, url: cached.url });
            LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, site.id, 'stopped');
            LocalMain.sendIPCEvent(types_1.IPC_CHANNELS.NGROK_CHANGED, site.id, false);
            logger.info(`Stopped ngrok tunnel for site ${site.id} because site was stopped`);
        }
    });
}
exports.default = default_1;
//# sourceMappingURL=main.js.map