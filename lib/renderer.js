"use strict";
/**
 * renderer.tsx -- Renderer Process Entry Point for the WordPress Supercharged Addon
 *
 * This is a thin wiring shell. It extracts React and hooks from Local's addon
 * context and delegates to feature-specific hook registration functions.
 *
 * To add a new feature, import its registration function and call it here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("./shared/types");
const debug_constants_hooks_1 = require("./features/debug-constants/debug-constants.hooks");
const ngrok_hooks_1 = require("./features/ngrok/ngrok.hooks");
const profiler_setup_hooks_1 = require("./features/profiler-setup/profiler-setup.hooks");
const conflict_test_hooks_1 = require("./features/conflict-test/conflict-test.hooks");
function default_1(context) {
    const { React, hooks } = context;
    (0, debug_constants_hooks_1.registerDebugConstantsHooks)(React, hooks);
    (0, ngrok_hooks_1.registerNgrokHooks)(React, hooks);
    if (types_1.FEATURE_FLAGS.PROFILER) {
        (0, profiler_setup_hooks_1.registerProfilerSetupHooks)(React, hooks);
    }
    (0, conflict_test_hooks_1.registerConflictTestHooks)(React, hooks);
}
exports.default = default_1;
//# sourceMappingURL=renderer.js.map