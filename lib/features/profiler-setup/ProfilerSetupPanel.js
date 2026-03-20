"use strict";
/**
 * ProfilerSetupPanel.tsx -- React component for the profiler setup UI.
 *
 * Exports a factory function (`createProfilerSetupPanel`) that accepts a
 * React instance and returns the component. This factory pattern is necessary
 * because Local provides its own React instance via `context.React`.
 *
 * The component renders a TableListRow in the Utilities section with:
 *   - A "Setup Profiler" / "Re-run Setup" button
 *   - A scrollable log panel showing real-time installation progress
 *   - A verification checklist showing the status of each tool
 *   - Error display for failures
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
exports.createProfilerSetupPanel = void 0;
const LocalRenderer = __importStar(require("@getflywheel/local/renderer"));
const electron_1 = require("electron");
const local_components_1 = require("@getflywheel/local-components");
const types_1 = require("../../shared/types");
/**
 * Factory function that creates the ProfilerSetupPanel component.
 *
 * @param React -- The React instance from Local's addon context.
 * @returns     -- The ProfilerSetupPanel functional component.
 */
function createProfilerSetupPanel(React) {
    const { useState, useEffect, useCallback, useRef } = React;
    /** Renders a single tool status line in the verification checklist. */
    const ToolStatusLine = ({ label, result }) => {
        const icon = result.status === 'ready' ? '\u2713' : result.status === 'error' ? '\u2717' : '-';
        const color = result.status === 'ready' ? '#27ae60' : result.status === 'error' ? '#e74c3c' : '#7f8c8d';
        const detail = result.version
            ? result.version
            : result.error
                ? result.error
                : 'not installed';
        return (React.createElement("div", { style: { color } },
            React.createElement("span", { style: { marginRight: '6px' } }, icon),
            React.createElement("strong", null, label),
            ": ",
            detail));
    };
    const ProfilerSetupPanel = ({ site }) => {
        const [status, setStatus] = useState(null);
        const [installing, setInstalling] = useState(false);
        const [logs, setLogs] = useState([]);
        const [error, setError] = useState('');
        const logEndRef = useRef(null);
        // Auto-scroll log panel to bottom when new logs arrive
        useEffect(() => {
            if (logEndRef.current) {
                logEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
        }, [logs]);
        /**
         * On mount: fetch current tool status from main process,
         * subscribe to log and completion push events.
         * On unmount: unsubscribe from all IPC listeners.
         */
        useEffect(() => {
            let active = true;
            LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.GET_PROFILER_STATUS, site.id)
                .then((result) => {
                if (active)
                    setStatus(result);
            })
                .catch(() => {
                // Status will remain null, showing no indicator
            });
            const onLog = (_event, siteId, message) => {
                if (active && siteId === site.id) {
                    setLogs((prev) => [...prev, message]);
                }
            };
            const onCompleted = (_event, siteId, result) => {
                if (active && siteId === site.id) {
                    setStatus(result);
                    setInstalling(false);
                }
            };
            electron_1.ipcRenderer.on(types_1.IPC_CHANNELS.PROFILER_SETUP_LOG, onLog);
            electron_1.ipcRenderer.on(types_1.IPC_CHANNELS.PROFILER_SETUP_COMPLETED, onCompleted);
            return () => {
                active = false;
                electron_1.ipcRenderer.removeListener(types_1.IPC_CHANNELS.PROFILER_SETUP_LOG, onLog);
                electron_1.ipcRenderer.removeListener(types_1.IPC_CHANNELS.PROFILER_SETUP_COMPLETED, onCompleted);
            };
        }, [site.id]);
        /**
         * Runs the full profiler setup sequence via IPC.
         */
        const handleSetup = useCallback(() => __awaiter(this, void 0, void 0, function* () {
            setInstalling(true);
            setLogs([]);
            setError('');
            try {
                const result = yield LocalRenderer.ipcAsync(types_1.IPC_CHANNELS.RUN_PROFILER_SETUP, site.id);
                setStatus(result);
            }
            catch (e) {
                setError(e.message || 'Setup failed');
            }
            finally {
                setInstalling(false);
            }
        }), [site.id]);
        const allReady = status
            && status.xhprof.status === 'ready'
            && status.k6.status === 'ready'
            && status.muPlugin.status === 'ready';
        const hasError = status
            && (status.xhprof.status === 'error'
                || status.k6.status === 'error'
                || status.muPlugin.status === 'error');
        return (React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            React.createElement("div", null,
                React.createElement(local_components_1.TextButton, { onClick: handleSetup, disabled: installing, style: { paddingLeft: 0 } }, installing
                    ? 'Installing...'
                    : allReady
                        ? 'Re-run Setup'
                        : 'Setup Profiler')),
            logs.length > 0 && (React.createElement("div", { style: {
                    maxHeight: '150px',
                    overflowY: 'auto',
                    backgroundColor: '#1e1e1e',
                    color: '#d4d4d4',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    padding: '8px',
                    borderRadius: '4px',
                    lineHeight: '1.4',
                } },
                logs.map((log, i) => (React.createElement("div", { key: i }, log))),
                React.createElement("div", { ref: logEndRef }))),
            status && !installing && (React.createElement("div", { style: { fontSize: '13px', lineHeight: '1.6' } },
                React.createElement(ToolStatusLine, { label: "xhprof", result: status.xhprof }),
                React.createElement(ToolStatusLine, { label: "k6", result: status.k6 }),
                React.createElement(ToolStatusLine, { label: "profiler agent", result: status.muPlugin }))),
            error && (React.createElement("div", { style: { color: '#e74c3c', fontSize: '13px' } }, error))));
    };
    return ProfilerSetupPanel;
}
exports.createProfilerSetupPanel = createProfilerSetupPanel;
//# sourceMappingURL=ProfilerSetupPanel.js.map