"use strict";
/**
 * profiler-setup.hooks.tsx -- Renderer-process hook registrations for the
 * profiler setup feature.
 *
 * Registers the ProfilerSetupPanel component on the siteInfoUtilities
 * content hook so the setup panel appears in the Tools tab.
 *
 * Note: The tab is labeled "Tools" in the UI but the hook name is
 * siteInfoUtilities (confirmed by testing). The TableListRow must be
 * returned directly from the addContent callback (not from a child
 * component) to match the pattern used by working addons.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProfilerSetupHooks = void 0;
const local_components_1 = require("@getflywheel/local-components");
const ProfilerSetupPanel_1 = require("./ProfilerSetupPanel");
/**
 * Registers all renderer-side hooks for the profiler setup feature.
 *
 * @param React -- The React instance from Local's addon context.
 * @param hooks -- The HooksRenderer class from Local's addon context.
 */
function registerProfilerSetupHooks(React, hooks) {
    const ProfilerSetupPanel = (0, ProfilerSetupPanel_1.createProfilerSetupPanel)(React);
    hooks.addContent('siteInfoUtilities', (site) => (React.createElement(local_components_1.TableListRow, { key: "wordpress-supercharged-profiler", label: "Profiler" },
        React.createElement(ProfilerSetupPanel, { site: site }))));
}
exports.registerProfilerSetupHooks = registerProfilerSetupHooks;
//# sourceMappingURL=profiler-setup.hooks.js.map