"use strict";
/**
 * renderer.tsx -- Renderer Process Entry Point
 */
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("./shared/types");
const DebugSwitches_1 = require("./features/debug-constants/DebugSwitches");
const NgrokRow_1 = require("./features/ngrok/NgrokRow");
const profiler_setup_hooks_1 = require("./features/profiler-setup/profiler-setup.hooks");
const ConflictTestPanel_1 = require("./features/conflict-test/ConflictTestPanel");
function default_1(context) {
    const { React, hooks } = context;
    (0, DebugSwitches_1.registerDebugConstantsHooks)(React, hooks);
    (0, NgrokRow_1.registerNgrokHooks)(React, hooks);
    if (types_1.FEATURE_FLAGS.PROFILER) {
        (0, profiler_setup_hooks_1.registerProfilerSetupHooks)(React, hooks);
    }
    (0, ConflictTestPanel_1.registerConflictTestHooks)(React, hooks);
}
exports.default = default_1;
//# sourceMappingURL=renderer.js.map