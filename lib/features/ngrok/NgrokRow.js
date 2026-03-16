"use strict";
/**
 * NgrokRow.tsx -- React component for managing ngrok tunnels.
 *
 * Exports a factory function (`createNgrokRow`) that accepts a React
 * instance and returns the component. This factory pattern is necessary because
 * Local provides its own React instance via `context.React`, and we must use
 * that rather than importing React directly (version mismatch risk).
 *
 * The component renders a TableListRow with:
 *   - URL text input for entering the ngrok domain
 *   - Save button to persist the URL to cache
 *   - Clear button to remove the URL mapping
 *   - Start/Stop button that enables wp-config.php constants AND spawns/kills
 *     the ngrok tunnel in one step
 *   - Status indicator (green/gray dot) showing tunnel state via the agent API
 *   - Inline error display for ngrok failures
 *
 * State is loaded from the main process on mount via GET_NGROK and
 * GET_NGROK_PROCESS_STATUS. Push events (NGROK_CHANGED,
 * NGROK_PROCESS_STATUS_CHANGED) keep the UI in sync when changes
 * happen from other sites or from the main process (e.g. site stopped).
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
exports.createNgrokRow = void 0;
const LocalRenderer = __importStar(require("@getflywheel/local/renderer"));
const electron_1 = require("electron");
const local_components_1 = require("@getflywheel/local-components");
const local_components_2 = require("@getflywheel/local-components");
const types_1 = require("../../shared/types");
/**
 * Factory function that creates the NgrokRow component.
 *
 * @param React -- The React instance from Local's addon context.
 * @returns     -- The NgrokRow functional component.
 */
function createNgrokRow(React) {
    const { useState, useEffect, useCallback } = React;
    const NgrokRow = ({ site }) => {
        const [enabled, setEnabled] = useState(false);
        const [url, setUrl] = useState('');
        const [savedUrl, setSavedUrl] = useState('');
        const [loading, setLoading] = useState(true);
        const [updating, setUpdating] = useState(false);
        const [processStatus, setProcessStatus] = useState('stopped');
        const [error, setError] = useState('');
        /**
         * On mount: fetch cached state and process status from main process,
         * subscribe to push events for cross-site updates.
         * On unmount: unsubscribe from all IPC listeners.
         */
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
        /** Updates the URL input value (not yet persisted). */
        const handleUrlChange = useCallback((event) => {
            setUrl(event.target.value);
        }, []);
        /** Persists the URL to cache via APPLY_NGROK. */
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
        /** Clears the URL mapping and constants via CLEAR_NGROK. */
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
         * Starts or stops the ngrok tunnel.
         *
         * Start: ENABLE_NGROK(true) -> sets wp-config.php constants,
         *        then START_NGROK_PROCESS -> spawns the tunnel.
         * Stop:  STOP_NGROK_PROCESS -> kills the tunnel,
         *        then ENABLE_NGROK(false) -> removes wp-config.php constants.
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
                React.createElement(local_components_2.TextButtonExternal, { onClick: handleApply, disabled: updating || enabled || !url.trim() || !urlDirty }, "Save"),
                React.createElement(local_components_2.TextButtonExternal, { onClick: handleClear, disabled: updating || (!url && !savedUrl) }, "Clear"),
                React.createElement(local_components_2.TextButtonExternal, { onClick: handleStartStop, disabled: updating || !savedUrl.trim() }, enabled ? 'Stop' : 'Start'),
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
    };
    return NgrokRow;
}
exports.createNgrokRow = createNgrokRow;
//# sourceMappingURL=NgrokRow.js.map