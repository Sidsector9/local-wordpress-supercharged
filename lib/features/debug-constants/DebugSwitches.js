"use strict";
/**
 * DebugSwitches.tsx -- React component and hook registration for toggling
 * WordPress debug constants (WP_DEBUG, WP_DEBUG_LOG, WP_DEBUG_DISPLAY, SCRIPT_DEBUG).
 *
 * Handles optimistic UI updates with rollback, and real-time sync when
 * wp-config.php is modified externally via file watcher events.
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
exports.registerDebugConstantsHooks = void 0;
const LocalRenderer = __importStar(require("@getflywheel/local/renderer"));
const electron_1 = require("electron");
const local_components_1 = require("@getflywheel/local-components");
const types_1 = require("../../shared/types");
let React;
function registerDebugConstantsHooks(_React, hooks) {
    React = _React;
    hooks.addContent('SiteInfoOverview_TableList', (site) => (React.createElement(DebugSwitches, { key: "wordpress-supercharged-debug", site: site })));
}
exports.registerDebugConstantsHooks = registerDebugConstantsHooks;
function DebugSwitches({ site }) {
    const { useState, useEffect, useCallback } = React;
    const [constants, setConstants] = useState(types_1.DEFAULT_DEBUG_STATE);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState({});
    useEffect(() => {
        LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.GET_DEBUG_CONSTANTS, site.id)
            .then((result) => setConstants(result))
            .catch(() => setConstants(types_1.DEFAULT_DEBUG_STATE))
            .finally(() => setLoading(false));
        LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.WATCH_SITE, site.id);
        const handleExternalChange = (_event, siteId, updated) => {
            if (siteId === site.id) {
                setConstants(updated);
            }
        };
        electron_1.ipcRenderer.on(types_1.IPC_CHANNELS.DEBUG_CONSTANTS_CHANGED, handleExternalChange);
        return () => {
            electron_1.ipcRenderer.removeListener(types_1.IPC_CHANNELS.DEBUG_CONSTANTS_CHANGED, handleExternalChange);
            LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.UNWATCH_SITE, site.id);
        };
    }, [site.id]);
    const handleToggle = useCallback((name, value) => __awaiter(this, void 0, void 0, function* () {
        const previous = constants[name];
        setConstants((prev) => (Object.assign(Object.assign({}, prev), { [name]: value })));
        setUpdating((prev) => (Object.assign(Object.assign({}, prev), { [name]: true })));
        try {
            const result = yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.SET_DEBUG_CONSTANT, site.id, name, value);
            if (result === null || result === void 0 ? void 0 : result.constants) {
                setConstants(result.constants);
            }
        }
        catch (e) {
            setConstants((prev) => (Object.assign(Object.assign({}, prev), { [name]: previous })));
        }
        finally {
            setUpdating((prev) => (Object.assign(Object.assign({}, prev), { [name]: false })));
        }
    }), [site.id, constants]);
    if (loading) {
        return null;
    }
    return (React.createElement(React.Fragment, null, types_1.DEBUG_CONSTANTS.map((constant) => (React.createElement(local_components_1.TableListRow, { key: constant, label: constant, alignMiddle: true },
        React.createElement(local_components_1.Switch, { tiny: true, flat: true, disabled: !!updating[constant], name: constant, checked: constants[constant], onChange: handleToggle }))))));
}
//# sourceMappingURL=DebugSwitches.js.map