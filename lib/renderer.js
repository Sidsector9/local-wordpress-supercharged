"use strict";
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
const LocalRenderer = __importStar(require("@getflywheel/local/renderer"));
const local_components_1 = require("@getflywheel/local-components");
const local_components_2 = require("@getflywheel/local-components");
const DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY'];
const DEFAULT_STATE = {
    WP_DEBUG: false,
    WP_DEBUG_LOG: false,
    WP_DEBUG_DISPLAY: false,
};
function default_1(context) {
    const { React, hooks } = context;
    const { useState, useEffect, useCallback } = React;
    const DebugSwitches = ({ site }) => {
        const [constants, setConstants] = useState(DEFAULT_STATE);
        const [loading, setLoading] = useState(true);
        useEffect(() => {
            LocalRenderer.ipcAsync('supercharged:get-debug-constants', site.id)
                .then((result) => setConstants(result))
                .catch(() => setConstants(DEFAULT_STATE))
                .finally(() => setLoading(false));
        }, [site.id]);
        const handleToggle = useCallback((name, value) => __awaiter(this, void 0, void 0, function* () {
            const previous = constants[name];
            setConstants((prev) => (Object.assign(Object.assign({}, prev), { [name]: value })));
            try {
                yield LocalRenderer.ipcAsync('supercharged:set-debug-constant', site.id, name, value);
            }
            catch (e) {
                setConstants((prev) => (Object.assign(Object.assign({}, prev), { [name]: previous })));
            }
        }), [site.id, constants]);
        if (loading) {
            return null;
        }
        return (React.createElement(React.Fragment, null, DEBUG_CONSTANTS.map((constant) => (React.createElement(local_components_1.TableListRow, { key: constant, label: constant, alignMiddle: true },
            React.createElement(local_components_2.Switch, { tiny: true, flat: true, name: constant, checked: constants[constant], onChange: handleToggle }))))));
    };
    hooks.addContent('SiteInfoOverview_TableList', (site) => (React.createElement(DebugSwitches, { key: "wordpress-supercharged-debug", site: site })));
}
exports.default = default_1;
//# sourceMappingURL=renderer.js.map