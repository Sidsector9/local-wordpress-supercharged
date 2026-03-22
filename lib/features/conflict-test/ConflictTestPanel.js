"use strict";
/**
 * ConflictTestPanel.tsx -- React component for conflict testing.
 *
 * Displays a list of all plugins with toggle switches to
 * enable/disable them via filter hooks (no database changes).
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
exports.createConflictTestPanel = void 0;
const LocalRenderer = __importStar(require("@getflywheel/local/renderer"));
const local_components_1 = require("@getflywheel/local-components");
const types_1 = require("../../shared/types");
function createConflictTestPanel(React) {
    const { useState, useEffect, useCallback } = React;
    const ConflictTestPanel = ({ site }) => {
        const [plugins, setPlugins] = useState([]);
        const [deps, setDeps] = useState({});
        const [overrides, setOverrides] = useState({ overrides: {} });
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState('');
        const [updating, setUpdating] = useState({});
        const fetchData = useCallback(() => __awaiter(this, void 0, void 0, function* () {
            setLoading(true);
            setError('');
            try {
                const [pluginData, overrideConfig] = yield Promise.all([
                    LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.GET_PLUGIN_LIST, site.id),
                    LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.GET_CONFLICT_OVERRIDES, site.id),
                ]);
                setPlugins(pluginData.plugins);
                setDeps(pluginData.dependencies);
                setOverrides(overrideConfig);
            }
            catch (e) {
                setError(e.message || 'Failed to load plugins');
            }
            finally {
                setLoading(false);
            }
        }), [site.id]);
        useEffect(() => { fetchData(); }, [fetchData]);
        const getEffectiveState = useCallback((plugin) => {
            if (plugin.file in overrides.overrides) {
                return overrides.overrides[plugin.file];
            }
            return plugin.status === 'active';
        }, [overrides]);
        const hasOverride = useCallback((plugin) => {
            return plugin.file in overrides.overrides;
        }, [overrides]);
        const handleToggle = useCallback((plugin) => __awaiter(this, void 0, void 0, function* () {
            const newState = !getEffectiveState(plugin);
            setUpdating((prev) => (Object.assign(Object.assign({}, prev), { [plugin.file]: true })));
            try {
                const result = yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.SET_CONFLICT_OVERRIDE, site.id, plugin.file, newState, plugin.status);
                setOverrides(result);
            }
            catch (_a) {
                // ignore
            }
            finally {
                setUpdating((prev) => (Object.assign(Object.assign({}, prev), { [plugin.file]: false })));
            }
        }), [site.id, getEffectiveState]);
        const handleReset = useCallback(() => __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.CLEAR_CONFLICT_OVERRIDES, site.id);
                setOverrides(result);
            }
            catch (_b) {
                // ignore
            }
        }), [site.id]);
        if (loading) {
            return React.createElement("div", { style: { fontSize: '13px', color: '#999' } }, "Loading plugins...");
        }
        if (plugins.length === 0) {
            return (React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                React.createElement("span", { style: { fontSize: '13px', color: '#999' } }, error || 'No plugins found. Make sure the site is running.'),
                React.createElement(local_components_1.TextButton, { onClick: fetchData, style: { paddingLeft: 0 } }, "Retry")));
        }
        const hasAnyOverrides = Object.keys(overrides.overrides).length > 0;
        return (React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
            React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '50px' } },
                React.createElement("span", { style: { fontSize: '13px', color: '#999' } }, "Toggle plugins on/off without modifying the database. Changes take effect on next page load."),
                hasAnyOverrides && (React.createElement(local_components_1.TextButton, { onClick: handleReset, style: { paddingLeft: 0 } }, "Reset All"))),
            React.createElement("div", { style: {
                    maxHeight: '400px',
                    overflowY: 'auto',
                    border: '1px solid #333',
                    borderRadius: '4px',
                } },
                React.createElement("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } },
                    React.createElement("thead", null,
                        React.createElement("tr", { style: { borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e1e' } },
                            React.createElement("th", { style: { padding: '8px 12px', textAlign: 'left', width: '30px' } }, "DB"),
                            React.createElement("th", { style: { padding: '8px 12px', textAlign: 'left' } }, "Plugins"),
                            React.createElement("th", { style: { padding: '8px 12px', textAlign: 'left', width: '80px' } }, "Version"),
                            React.createElement("th", { style: { padding: '8px 12px', textAlign: 'center', width: '70px' } }, "Active"))),
                    React.createElement("tbody", null, plugins.map((plugin) => {
                        const effective = getEffectiveState(plugin);
                        const isOverridden = hasOverride(plugin);
                        const isUpdating = updating[plugin.file] || false;
                        const dbActive = plugin.status === 'active';
                        return (React.createElement("tr", { key: plugin.file, style: {
                                borderBottom: '1px solid #2a2a2a',
                                opacity: isUpdating ? 0.5 : 1,
                                backgroundColor: isOverridden ? 'rgba(255, 165, 0, 0.05)' : 'transparent',
                            } },
                            React.createElement("td", { style: { padding: '6px 12px' } },
                                React.createElement("span", { style: {
                                        display: 'inline-block',
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: dbActive ? '#27ae60' : '#7f8c8d',
                                    } })),
                            React.createElement("td", { style: { padding: '6px 12px' } },
                                plugin.name,
                                isOverridden && (React.createElement("span", { style: { marginLeft: '8px', fontSize: '11px', color: '#f39c12' } }, "(overridden)")),
                                deps[plugin.file] && (React.createElement("span", { style: { marginLeft: '8px', fontSize: '11px', color: '#7f8c8d' } },
                                    "requires: ",
                                    deps[plugin.file]))),
                            React.createElement("td", { style: { padding: '6px 12px', color: '#999' } }, plugin.version),
                            React.createElement("td", { style: { padding: '6px 12px', textAlign: 'center' } },
                                React.createElement("input", { type: "checkbox", checked: effective, disabled: isUpdating, onChange: () => handleToggle(plugin), style: { cursor: isUpdating ? 'wait' : 'pointer' } }))));
                    })))),
            React.createElement("div", { style: { fontSize: '12px', color: '#777', lineHeight: '1.6' } },
                React.createElement("strong", null, "DB"),
                " = the plugin's real status in the database (green = active, gray = inactive). This does not change when you toggle.",
                React.createElement("br", null),
                React.createElement("strong", null, "Active"),
                " = whether the plugin will actually load on the next page request. Uncheck to deactivate a plugin for testing without modifying the database.")));
    };
    return ConflictTestPanel;
}
exports.createConflictTestPanel = createConflictTestPanel;
//# sourceMappingURL=ConflictTestPanel.js.map