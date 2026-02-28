"use strict";
/**
 * debug-constants.hooks.ts -- Renderer-process hook registrations for the
 * debug constants feature.
 *
 * Registers the DebugSwitches component on the SiteInfoOverview_TableList
 * content hook so the switches appear in the site overview table.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDebugConstantsHooks = void 0;
const DebugSwitches_1 = require("./DebugSwitches");
/**
 * Registers all renderer-side hooks for the debug constants feature.
 *
 * @param React -- The React instance from Local's addon context.
 * @param hooks -- The HooksRenderer class from Local's addon context.
 */
function registerDebugConstantsHooks(React, hooks) {
    const DebugSwitches = (0, DebugSwitches_1.createDebugSwitches)(React);
    hooks.addContent('SiteInfoOverview_TableList', (site) => (React.createElement(DebugSwitches, { key: "wordpress-supercharged-debug", site: site })));
}
exports.registerDebugConstantsHooks = registerDebugConstantsHooks;
//# sourceMappingURL=debug-constants.hooks.js.map