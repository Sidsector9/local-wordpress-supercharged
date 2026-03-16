"use strict";
/**
 * ngrok.hooks.tsx -- Renderer-process hook registrations for the ngrok feature.
 *
 * Registers the NgrokRow component on the SiteInfoOverview_TableList
 * content hook so the ngrok controls appear in the site overview table.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerNgrokHooks = void 0;
const NgrokRow_1 = require("./NgrokRow");
/**
 * Registers all renderer-side hooks for the ngrok feature.
 *
 * @param React -- The React instance from Local's addon context.
 * @param hooks -- The HooksRenderer class from Local's addon context.
 */
function registerNgrokHooks(React, hooks) {
    const NgrokRow = (0, NgrokRow_1.createNgrokRow)(React);
    hooks.addContent('SiteInfoOverview_TableList', (site) => (React.createElement(NgrokRow, { key: "wordpress-supercharged-ngrok", site: site })));
}
exports.registerNgrokHooks = registerNgrokHooks;
//# sourceMappingURL=ngrok.hooks.js.map