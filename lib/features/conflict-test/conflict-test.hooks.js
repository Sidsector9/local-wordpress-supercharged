"use strict";
/**
 * conflict-test.hooks.tsx -- Renderer-process hook registrations for the
 * conflict testing feature.
 *
 * Registers the ConflictTestPanel component on the siteInfoUtilities
 * content hook so it appears in the Tools tab.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConflictTestHooks = void 0;
const local_components_1 = require("@getflywheel/local-components");
const ConflictTestPanel_1 = require("./ConflictTestPanel");
/**
 * Registers all renderer-side hooks for the conflict testing feature.
 */
function registerConflictTestHooks(React, hooks) {
    const ConflictTestPanel = (0, ConflictTestPanel_1.createConflictTestPanel)(React);
    hooks.addContent('siteInfoUtilities', (site) => (React.createElement(local_components_1.TableListRow, { key: "wordpress-supercharged-conflict-test", label: "Conflict Testing" },
        React.createElement(ConflictTestPanel, { site: site }))));
}
exports.registerConflictTestHooks = registerConflictTestHooks;
//# sourceMappingURL=conflict-test.hooks.js.map