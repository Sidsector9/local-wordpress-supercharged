"use strict";
/**
 * main.ts — Main Process Entry Point for the WordPress Supercharged Addon
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
const debug_constants_ipc_1 = require("./features/debug-constants/debug-constants.ipc");
function default_1(context) {
    const { wpCli, siteData, localLogger } = LocalMain.getServiceContainer().cradle;
    const logger = localLogger.child({
        thread: 'main',
        addon: 'wordpress-supercharged',
    });
    (0, debug_constants_ipc_1.registerDebugConstantsIpc)({ wpCli, siteData, logger });
}
exports.default = default_1;
//# sourceMappingURL=main.js.map