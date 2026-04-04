"use strict";
/**
 * ngrok.process.ts -- Manages ngrok CLI child processes and communicates with
 * the ngrok agent API at 127.0.0.1:4040.
 *
 * Uses child_process.spawn (not Local's Process class) because ngrok
 * is a standalone CLI tool that should not auto-restart.
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
exports.getNgrokProcessStatus = exports.isNgrokProcessRunning = exports.stopNgrokProcess = exports.startNgrokProcess = exports.deleteTunnel = exports.findTunnelByDomain = exports.fetchNgrokTunnels = exports.extractDomain = exports.resolveNgrokBin = void 0;
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const child_process_1 = require("child_process");
/** Running ngrok processes keyed by siteId. */
const processes = new Map();
const isWindows = process.platform === 'win32';
let resolvedNgrokPath = null;
/**
 * Resolves the full path to the ngrok binary.
 *
 * Electron doesn't inherit the user's shell PATH, so we shell out to
 * the login shell for `which ngrok`, falling back to common install paths.
 */
function resolveNgrokBin() {
    if (resolvedNgrokPath) {
        return resolvedNgrokPath;
    }
    resolvedNgrokPath = isWindows ? resolveNgrokWindows() : resolveNgrokUnix();
    return resolvedNgrokPath;
}
exports.resolveNgrokBin = resolveNgrokBin;
function resolveNgrokUnix() {
    const shell = process.env.SHELL || '/bin/sh';
    try {
        return (0, child_process_1.execFileSync)(shell, ['-l', '-c', 'which ngrok'], {
            encoding: 'utf8',
            timeout: 5000,
        }).trim();
    }
    catch (_a) {
        // fall through
    }
    for (const candidate of ['/opt/homebrew/bin/ngrok', '/usr/local/bin/ngrok', '/snap/bin/ngrok']) {
        try {
            (0, child_process_1.execFileSync)(candidate, ['version'], { encoding: 'utf8', timeout: 3000 });
            return candidate;
        }
        catch (_b) {
            // try next
        }
    }
    return 'ngrok';
}
function resolveNgrokWindows() {
    const comspec = process.env.ComSpec || 'cmd.exe';
    try {
        const result = (0, child_process_1.execFileSync)(comspec, ['/c', 'where', 'ngrok'], {
            encoding: 'utf8',
            timeout: 5000,
        }).trim();
        return result.split(/\r?\n/)[0];
    }
    catch (_a) {
        // fall through
    }
    const candidates = [];
    if (process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, 'ngrok', 'ngrok.exe'));
    }
    if (process.env.ChocolateyInstall) {
        candidates.push(path.join(process.env.ChocolateyInstall, 'bin', 'ngrok.exe'));
    }
    if (process.env.USERPROFILE) {
        candidates.push(path.join(process.env.USERPROFILE, 'scoop', 'shims', 'ngrok.exe'));
    }
    for (const candidate of candidates) {
        try {
            (0, child_process_1.execFileSync)(candidate, ['version'], { encoding: 'utf8', timeout: 3000 });
            return candidate;
        }
        catch (_b) {
            // try next
        }
    }
    return 'ngrok.exe';
}
function extractDomain(url) {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
exports.extractDomain = extractDomain;
const NGROK_API_BASE = 'http://127.0.0.1:4040';
/** Queries the ngrok agent API for active tunnels. Returns [] on any error. */
function fetchNgrokTunnels() {
    return new Promise((resolve) => {
        const req = http.get(`${NGROK_API_BASE}/api/tunnels`, { timeout: 3000 }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk.toString(); });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve(Array.isArray(parsed.tunnels) ? parsed.tunnels : []);
                }
                catch (_a) {
                    resolve([]);
                }
            });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
    });
}
exports.fetchNgrokTunnels = fetchNgrokTunnels;
function findTunnelByDomain(ngrokUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const domain = extractDomain(ngrokUrl);
        const tunnels = yield fetchNgrokTunnels();
        return tunnels.find((t) => extractDomain(t.public_url || '') === domain);
    });
}
exports.findTunnelByDomain = findTunnelByDomain;
/** Deletes a tunnel by name. Resolves on 204 (deleted) or 404 (already gone). */
function deleteTunnel(tunnelName) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${NGROK_API_BASE}/api/tunnels/${encodeURIComponent(tunnelName)}`);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'DELETE',
            timeout: 5000,
        }, (res) => {
            if (res.statusCode === 204 || res.statusCode === 404) {
                resolve();
            }
            else {
                reject(new Error(`Failed to delete tunnel: HTTP ${res.statusCode}`));
            }
            res.resume();
        });
        req.on('error', (err) => reject(err));
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout deleting tunnel')); });
        req.end();
    });
}
exports.deleteTunnel = deleteTunnel;
/**
 * Starts an ngrok tunnel for a site.
 *
 * Checks the agent API first -- if this domain is already tunneled, deletes it
 * to avoid "endpoint already online" errors. The onExit callback fires when
 * the process exits, with an optional error message from stderr or exit code.
 */
function startNgrokProcess(siteId, ngrokUrl, siteDomain, httpPort, onExit) {
    return __awaiter(this, void 0, void 0, function* () {
        const domain = extractDomain(ngrokUrl);
        const target = `${siteDomain}:${httpPort}`;
        const existing = yield findTunnelByDomain(ngrokUrl);
        if (existing) {
            yield deleteTunnel(existing.name);
        }
        if (processes.has(siteId)) {
            stopNgrokProcess(siteId);
        }
        const ngrokBin = resolveNgrokBin();
        const child = (0, child_process_1.spawn)(ngrokBin, ['http', `--domain=${domain}`, target], {
            stdio: ['ignore', 'ignore', 'pipe'],
            detached: false,
        });
        processes.set(siteId, child);
        let stderrData = '';
        if (child.stderr) {
            child.stderr.on('data', (chunk) => {
                stderrData += chunk.toString();
            });
        }
        let exited = false;
        const cleanup = (codeOrError) => {
            if (exited) {
                return;
            }
            exited = true;
            processes.delete(siteId);
            let errorMsg;
            if (codeOrError instanceof Error) {
                errorMsg = codeOrError.code === 'ENOENT'
                    ? 'ngrok not found -- is it installed and on your PATH?'
                    : codeOrError.message;
            }
            else if (codeOrError != null && codeOrError !== 0) {
                errorMsg = stderrData.trim() || `ngrok exited with code ${codeOrError}`;
            }
            onExit(siteId, errorMsg);
        };
        child.on('exit', (code) => cleanup(code));
        child.on('error', (err) => cleanup(err));
    });
}
exports.startNgrokProcess = startNgrokProcess;
/**
 * Kills the ngrok process for a site. Removes listeners before killing
 * to prevent the onExit callback from firing (caller handles status updates).
 */
function stopNgrokProcess(siteId) {
    const child = processes.get(siteId);
    if (child) {
        processes.delete(siteId);
        child.removeAllListeners();
        if (child.stderr) {
            child.stderr.removeAllListeners();
        }
        child.kill('SIGTERM');
    }
}
exports.stopNgrokProcess = stopNgrokProcess;
function isNgrokProcessRunning(siteId) {
    return processes.has(siteId);
}
exports.isNgrokProcessRunning = isNgrokProcessRunning;
/**
 * Checks tunnel status via the ngrok agent API. Only reports 'running' when
 * the site has ngrok enabled AND the tunnel domain is found, so that sites
 * sharing the same URL don't all show "Tunnel active".
 */
function getNgrokProcessStatus(ngrokUrl, enabled) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!ngrokUrl || !enabled) {
            return 'stopped';
        }
        const tunnel = yield findTunnelByDomain(ngrokUrl);
        return tunnel ? 'running' : 'stopped';
    });
}
exports.getNgrokProcessStatus = getNgrokProcessStatus;
//# sourceMappingURL=ngrok.process.js.map