"use strict";
/**
 * NgrokRow.tsx -- React component and hook registration for managing ngrok tunnels.
 *
 * Renders a TableListRow with URL input, Save/Clear/Start/Stop buttons,
 * and a status indicator. State is synced via IPC push events.
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
exports.registerNgrokHooks = void 0;
const LocalRenderer = __importStar(require("@getflywheel/local/renderer"));
const electron_1 = require("electron");
const local_components_1 = require("@getflywheel/local-components");
const types_1 = require("../../shared/types");
let React;
function registerNgrokHooks(_React, hooks) {
    React = _React;
    hooks.addContent('SiteInfoOverview_TableList', (site) => (React.createElement(NgrokRow, { key: "wordpress-supercharged-ngrok", site: site })));
}
exports.registerNgrokHooks = registerNgrokHooks;
function NgrokRow({ site }) {
    const { useState, useEffect, useCallback } = React;
    const [enabled, setEnabled] = useState(false);
    const [url, setUrl] = useState('');
    const [savedUrl, setSavedUrl] = useState('');
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [processStatus, setProcessStatus] = useState('stopped');
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.GET_NGROK, site.id)
            .then((result) => {
            if (active) {
                setEnabled(!!result.enabled);
                setUrl(result.url || '');
                setSavedUrl(result.url || '');
            }
        })
            .catch(() => {
            if (active) {
                setEnabled(false);
                setUrl('');
                setSavedUrl('');
            }
        })
            .finally(() => {
            if (active) {
                setLoading(false);
            }
        });
        LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.GET_NGROK_PROCESS_STATUS, site.id)
            .then((status) => {
            if (active) {
                setProcessStatus(status === 'running' ? 'running' : 'stopped');
            }
        })
            .catch(() => { });
        const handleNgrokChanged = (_event, siteId, newEnabled) => {
            if (siteId === site.id && active) {
                setEnabled(newEnabled);
            }
        };
        const handleProcessStatusChanged = (_event, siteId, status, errorMsg) => {
            if (siteId === site.id && active) {
                setProcessStatus(status === 'running' ? 'running' : 'stopped');
                setError(errorMsg || '');
            }
        };
        electron_1.ipcRenderer.on(types_1.IPC_CHANNELS.NGROK_CHANGED, handleNgrokChanged);
        electron_1.ipcRenderer.on(types_1.IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, handleProcessStatusChanged);
        return () => {
            active = false;
            electron_1.ipcRenderer.removeListener(types_1.IPC_CHANNELS.NGROK_CHANGED, handleNgrokChanged);
            electron_1.ipcRenderer.removeListener(types_1.IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, handleProcessStatusChanged);
        };
    }, [site.id]);
    const handleUrlChange = useCallback((event) => {
        setUrl(event.target.value);
    }, []);
    const handleApply = useCallback(() => __awaiter(this, void 0, void 0, function* () {
        const trimmed = url.trim();
        if (!trimmed) {
            return;
        }
        setUpdating(true);
        try {
            yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.APPLY_NGROK, site.id, trimmed);
            setSavedUrl(trimmed);
            setUrl(trimmed);
        }
        catch (e) {
            // keep current input value
        }
        finally {
            setUpdating(false);
        }
    }), [site.id, url]);
    const handleClear = useCallback(() => __awaiter(this, void 0, void 0, function* () {
        setUpdating(true);
        try {
            yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.CLEAR_NGROK, site.id);
            setEnabled(false);
            setUrl('');
            setSavedUrl('');
        }
        catch (e) {
            // keep current state
        }
        finally {
            setUpdating(false);
        }
    }), [site.id]);
    /**
     * Start: sets wp-config.php constants, then spawns the tunnel.
     * Stop: kills the tunnel, then removes wp-config.php constants.
     */
    const handleStartStop = useCallback(() => __awaiter(this, void 0, void 0, function* () {
        if (!savedUrl.trim()) {
            return;
        }
        setUpdating(true);
        setError('');
        try {
            if (enabled) {
                yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.STOP_NGROK_PROCESS, site.id);
                yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.ENABLE_NGROK, site.id, false, savedUrl.trim());
                setEnabled(false);
            }
            else {
                yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.ENABLE_NGROK, site.id, true, savedUrl.trim());
                setEnabled(true);
                yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.START_NGROK_PROCESS, site.id);
            }
        }
        catch (e) {
            setError((e === null || e === void 0 ? void 0 : e.message) || 'Failed to toggle ngrok');
        }
        finally {
            setUpdating(false);
        }
    }), [site.id, enabled, savedUrl]);
    if (loading) {
        return null;
    }
    const urlDirty = url.trim() !== savedUrl;
    const isRunning = processStatus === 'running';
    return (React.createElement(local_components_1.TableListRow, { label: "ngrok", alignMiddle: true },
        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            React.createElement("input", { type: "text", placeholder: "Enter the ngrok URL", value: url, onChange: handleUrlChange, readOnly: enabled, disabled: updating, style: {
                    flexGrow: 1,
                    minWidth: '220px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                    color: 'inherit',
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                    padding: '4px 0',
                    outline: 'none',
                    opacity: enabled ? 0.6 : 1,
                } }),
            React.createElement(local_components_1.TextButtonExternal, { onClick: handleApply, disabled: updating || enabled || !url.trim() || !urlDirty }, "Save"),
            React.createElement(local_components_1.TextButtonExternal, { onClick: handleClear, disabled: updating || (!url && !savedUrl) }, "Clear"),
            React.createElement(local_components_1.TextButtonExternal, { onClick: handleStartStop, disabled: updating || !savedUrl.trim() }, enabled ? 'Stop' : 'Start'),
            savedUrl && (React.createElement("span", { style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    opacity: 0.8,
                    whiteSpace: 'nowrap',
                } },
                React.createElement("span", { style: {
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: isRunning ? '#51bb7b' : '#9b9b9b',
                    } }),
                isRunning ? 'Tunnel active' : 'Tunnel inactive'))),
        error && (React.createElement("div", { style: { color: '#e74c3c', fontSize: '12px', marginTop: '6px' } }, error))));
}
//# sourceMappingURL=NgrokRow.js.map