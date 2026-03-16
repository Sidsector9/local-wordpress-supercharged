/**
 * ngrok.process.ts -- Manages ngrok CLI child processes and communicates with
 * the ngrok agent API at 127.0.0.1:4040.
 *
 * Only one ngrok URL should run at a time. Before starting a tunnel,
 * we check the ngrok agent API and stop any existing tunnel for that
 * domain. Status checks also use the API so the UI reflects reality
 * when switching between sites in Local.
 *
 * Uses child_process.spawn (not Local's Process class) because ngrok
 * is a standalone CLI tool that should not auto-restart.
 */

import * as path from 'path';
import * as http from 'http';
import { spawn, execFileSync, ChildProcess } from 'child_process';

/**
 * Module-level Map tracking running ngrok processes by siteId.
 * Used to kill processes on stop and to prevent duplicate spawns.
 */
const processes = new Map<string, ChildProcess>();

const isWindows = process.platform === 'win32';

/**
 * Cached result of the ngrok binary path resolution.
 * Set once by resolveNgrokBin() and reused for all subsequent spawns.
 */
let resolvedNgrokPath: string | null = null;

/**
 * Resolves the full path to the ngrok binary.
 *
 * Electron apps don't inherit the user's shell PATH, so a bare `ngrok`
 * would fail with ENOENT. We shell out to the user's login shell to
 * run `which ngrok` (macOS/Linux) or `where ngrok` (Windows), then
 * cache the result for all subsequent spawns.
 *
 * Falls back to common install paths if the shell lookup fails:
 *   - macOS:   /opt/homebrew/bin/ngrok, /usr/local/bin/ngrok
 *   - Linux:   /usr/local/bin/ngrok, /snap/bin/ngrok
 *   - Windows: %LOCALAPPDATA%\ngrok, Chocolatey, Scoop
 *
 * @returns -- Absolute path to the ngrok binary, or 'ngrok'/'ngrok.exe' as last resort.
 */
export function resolveNgrokBin(): string {
	if (resolvedNgrokPath) {
		return resolvedNgrokPath;
	}

	if (isWindows) {
		resolvedNgrokPath = resolveNgrokWindows();
	} else {
		resolvedNgrokPath = resolveNgrokUnix();
	}

	return resolvedNgrokPath;
}

/**
 * macOS/Linux: resolves ngrok via `$SHELL -l -c 'which ngrok'`,
 * falling back to common Homebrew/snap paths.
 */
function resolveNgrokUnix(): string {
	const shell = process.env.SHELL || '/bin/sh';

	try {
		return execFileSync(shell, ['-l', '-c', 'which ngrok'], {
			encoding: 'utf8',
			timeout: 5000,
		}).trim();
	} catch {
		// fall through
	}

	for (const candidate of ['/opt/homebrew/bin/ngrok', '/usr/local/bin/ngrok', '/snap/bin/ngrok']) {
		try {
			execFileSync(candidate, ['version'], { encoding: 'utf8', timeout: 3000 });
			return candidate;
		} catch {
			// try next
		}
	}

	return 'ngrok';
}

/**
 * Windows: resolves ngrok via `where ngrok`, falling back to
 * %LOCALAPPDATA%, Chocolatey, and Scoop install paths.
 */
function resolveNgrokWindows(): string {
	const comspec = process.env.ComSpec || 'cmd.exe';

	try {
		const result = execFileSync(comspec, ['/c', 'where', 'ngrok'], {
			encoding: 'utf8',
			timeout: 5000,
		}).trim();
		return result.split(/\r?\n/)[0];
	} catch {
		// fall through
	}

	const candidates: string[] = [];
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
			execFileSync(candidate, ['version'], { encoding: 'utf8', timeout: 3000 });
			return candidate;
		} catch {
			// try next
		}
	}

	return 'ngrok.exe';
}

/**
 * Strips protocol and trailing slash from a URL to extract the bare domain.
 *
 * @param url -- Full URL (e.g. "https://foo.ngrok-free.dev/").
 * @returns   -- Bare domain (e.g. "foo.ngrok-free.dev").
 */
export function extractDomain(url: string): string {
	return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/** Base URL for the ngrok agent's local API. */
const NGROK_API_BASE = 'http://127.0.0.1:4040';

/**
 * Shape of a tunnel object returned by the ngrok agent API.
 *
 * @property name       -- Tunnel name (used as the identifier for DELETE).
 * @property public_url -- The public ngrok URL (e.g. "https://foo.ngrok-free.dev").
 * @property config     -- Configuration object containing the backend address.
 */
export interface NgrokTunnel {
	name: string;
	public_url: string;
	config?: { addr?: string };
	[key: string]: any;
}

/**
 * Queries the ngrok agent API at 127.0.0.1:4040/api/tunnels for active tunnels.
 *
 * Returns an empty array if the agent is not running (connection refused),
 * if the response is not valid JSON, or if the request times out.
 *
 * @returns -- Array of active tunnel objects, or [] on any error.
 */
export function fetchNgrokTunnels(): Promise<NgrokTunnel[]> {
	return new Promise((resolve) => {
		const req = http.get(`${NGROK_API_BASE}/api/tunnels`, { timeout: 3000 }, (res) => {
			let body = '';
			res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
			res.on('end', () => {
				try {
					const parsed = JSON.parse(body);
					resolve(Array.isArray(parsed.tunnels) ? parsed.tunnels : []);
				} catch {
					resolve([]);
				}
			});
		});
		req.on('error', () => resolve([]));
		req.on('timeout', () => { req.destroy(); resolve([]); });
	});
}

/**
 * Finds a tunnel by its public domain in the ngrok agent API.
 *
 * Compares the bare domain (protocol/slash stripped) of each tunnel's
 * public_url against the given ngrok URL.
 *
 * @param ngrokUrl -- The ngrok URL to search for (e.g. "https://foo.ngrok-free.dev").
 * @returns        -- The matching tunnel object, or undefined if not found.
 */
export async function findTunnelByDomain(ngrokUrl: string): Promise<NgrokTunnel | undefined> {
	const domain = extractDomain(ngrokUrl);
	const tunnels = await fetchNgrokTunnels();
	return tunnels.find((t) => extractDomain(t.public_url || '') === domain);
}

/**
 * Deletes a tunnel by name via the ngrok agent API.
 *
 * Sends DELETE to 127.0.0.1:4040/api/tunnels/<name>.
 * Resolves on 204 (deleted) or 404 (already gone). Rejects on other status codes.
 *
 * @param tunnelName -- The tunnel name (from NgrokTunnel.name).
 */
export function deleteTunnel(tunnelName: string): Promise<void> {
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
			} else {
				reject(new Error(`Failed to delete tunnel: HTTP ${res.statusCode}`));
			}
			res.resume();
		});
		req.on('error', (err) => reject(err));
		req.on('timeout', () => { req.destroy(); reject(new Error('Timeout deleting tunnel')); });
		req.end();
	});
}

/**
 * Starts an ngrok tunnel for a site.
 *
 * Steps:
 *   1. Check the agent API -- if this domain is already tunneled, delete it
 *      first to avoid "endpoint already online" errors.
 *   2. Kill any tracked process for this siteId (from a previous start).
 *   3. Spawn `ngrok http --domain=<domain> <siteDomain>:<httpPort>`.
 *   4. Capture stderr so errors can be surfaced to the UI.
 *
 * The onExit callback is called when the process exits or errors, with an
 * optional error message extracted from stderr or the exit code.
 *
 * @param siteId     -- Local's unique site identifier.
 * @param ngrokUrl   -- The ngrok URL (e.g. "https://foo.ngrok-free.dev").
 * @param siteDomain -- The site's local domain (e.g. "mysite.local").
 * @param httpPort   -- The site's HTTP port (e.g. 80, 10008).
 * @param onExit     -- Callback invoked when the process exits. Receives the siteId
 *                      and an optional error message string.
 */
export async function startNgrokProcess(
	siteId: string,
	ngrokUrl: string,
	siteDomain: string,
	httpPort: number,
	onExit: (siteId: string, error?: string) => void,
): Promise<void> {
	const domain = extractDomain(ngrokUrl);
	const target = `${siteDomain}:${httpPort}`;

	// If this domain is already tunneled, stop it first
	const existing = await findTunnelByDomain(ngrokUrl);
	if (existing) {
		await deleteTunnel(existing.name);
	}

	if (processes.has(siteId)) {
		stopNgrokProcess(siteId);
	}

	const ngrokBin = resolveNgrokBin();
	const child = spawn(ngrokBin, ['http', `--domain=${domain}`, target], {
		stdio: ['ignore', 'ignore', 'pipe'],
		detached: false,
	});

	processes.set(siteId, child);

	let stderrData = '';

	if (child.stderr) {
		child.stderr.on('data', (chunk: Buffer) => {
			stderrData += chunk.toString();
		});
	}

	let exited = false;
	const cleanup = (codeOrError?: number | NodeJS.ErrnoException | null) => {
		if (exited) {
			return;
		}
		exited = true;
		processes.delete(siteId);

		let errorMsg: string | undefined;
		if (codeOrError instanceof Error) {
			errorMsg = (codeOrError as NodeJS.ErrnoException).code === 'ENOENT'
				? 'ngrok not found -- is it installed and on your PATH?'
				: codeOrError.message;
		} else if (codeOrError != null && codeOrError !== 0) {
			errorMsg = stderrData.trim() || `ngrok exited with code ${codeOrError}`;
		}

		onExit(siteId, errorMsg);
	};

	child.on('exit', (code) => cleanup(code));
	child.on('error', (err) => cleanup(err));
}

/**
 * Kills the ngrok process for a site via SIGTERM.
 *
 * Removes all event listeners before killing to prevent the onExit
 * callback from firing (the caller handles status updates directly).
 * No-op if no process is tracked for this siteId.
 *
 * @param siteId -- Local's unique site identifier.
 */
export function stopNgrokProcess(siteId: string): void {
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

/**
 * Returns whether an ngrok process is tracked in the in-memory Map
 * for the given site.
 *
 * @param siteId -- Local's unique site identifier.
 * @returns      -- true if a process is currently tracked, false otherwise.
 */
export function isNgrokProcessRunning(siteId: string): boolean {
	return processes.has(siteId);
}

/**
 * Checks whether a tunnel for the given ngrok URL is active by querying
 * the ngrok agent API.
 *
 * Only reports 'running' when the site has ngrok enabled AND the tunnel
 * domain is found in the API. This way, if two sites share the same URL,
 * only the enabled one shows as active.
 *
 * @param ngrokUrl -- The ngrok URL to check for (e.g. "https://foo.ngrok-free.dev").
 * @param enabled  -- Whether this site currently has ngrok enabled in its cache.
 * @returns        -- 'running' if the tunnel is active for this site, 'stopped' otherwise.
 */
export async function getNgrokProcessStatus(ngrokUrl?: string, enabled?: boolean): Promise<'running' | 'stopped'> {
	if (!ngrokUrl || !enabled) {
		return 'stopped';
	}

	const tunnel = await findTunnelByDomain(ngrokUrl);
	return tunnel ? 'running' : 'stopped';
}
