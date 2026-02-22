"use strict";
/**
 * renderer.tsx — Renderer Process Entry Point for the WordPress Supercharged Addon
 *
 * This is a thin wiring shell. It extracts React and hooks from Local's addon
 * context and delegates to feature-specific hook registration functions.
 *
 * To add a new feature, import its registration function and call it here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const debug_constants_hooks_1 = require("./features/debug-constants/debug-constants.hooks");
function default_1(context) {
    const { React, hooks } = context;
    (0, debug_constants_hooks_1.registerDebugConstantsHooks)(React, hooks);
}
exports.default = default_1;
//# sourceMappingURL=renderer.js.map