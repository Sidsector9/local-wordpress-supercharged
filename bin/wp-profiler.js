#!/usr/bin/env node
/**
 * wp-profiler -- CLI wrapper for the two-phase WordPress load test runner.
 *
 * Usage (from Local's site shell):
 *   wp-profiler run --users 50 --duration 10s --urls / /about --username admin --password admin
 *
 * Phase A (baseline): 1 VU, 1 request per URL -- captures clean xhprof profile.
 * Phase B (load test): N VUs for specified duration -- measures cost under concurrency.
 * Report: compares baseline vs load test, prints tabular output with scaling ratios.
 */

const { execFile, execFileSync, execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// Argument parsing (no dependencies -- just process.argv)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args[0] !== 'run' || args.includes('--help') || args.includes('-h')) {
	console.log(`
Usage: wp-profiler run [options]

Options:
  --users <n>          Number of concurrent virtual users (default: 50)
  --duration <time>    Duration of load test phase (default: 10s)
  --urls <paths...>    URL paths to test (default: /)
  --username <user>    WordPress admin username (for authenticated requests)
  --password <pass>    WordPress admin password
  --site-url <url>     Site URL (auto-detected from environment if omitted)
  --top <n>            Number of rows to show per table (default: 15)
  --baseline-requests  Number of warm baseline requests (default: 5)
  --ramp-up <time>     Ramp-up duration to reach target users (default: 5s)

  --help               Show this help
`);
	process.exit(0);
}

function getArg(name, defaultValue) {
	// Handle both --flag value and --flag=value
	for (let i = 0; i < args.length; i++) {
		if (args[i] === name) return args[i + 1];
		if (args[i].startsWith(name + '=')) return args[i].slice(name.length + 1);
	}
	return defaultValue;
}

function getArgList(name, defaultValue) {
	const idx = args.indexOf(name);
	if (idx === -1) return defaultValue;
	const values = [];
	for (let i = idx + 1; i < args.length; i++) {
		if (args[i].startsWith('--')) break;
		values.push(args[i]);
	}
	return values.length > 0 ? values : defaultValue;
}

const users = parseInt(getArg('--users', '50'), 10);
const duration = getArg('--duration', '10s');
const urls = getArgList('--urls', ['/']);
const username = getArg('--username', null);
const password = getArg('--password', null);
const topN = parseInt(getArg('--top', '15'), 10);
const baselineRequests = parseInt(getArg('--baseline-requests', '5'), 10);
const rampUp = getArg('--ramp-up', '5s');
let siteUrl = getArg('--site-url', null);


// Auto-detect site URL from environment or Local's sites.json
if (!siteUrl) {
	if (process.env.SITE_URL) {
		siteUrl = process.env.SITE_URL;
	} else {
		// Read Local's sites.json and match by current working directory
		const sitesJsonPath = path.join(os.homedir(), 'Library', 'Application Support', 'Local', 'sites.json');
		try {
			const sites = JSON.parse(fs.readFileSync(sitesJsonPath, 'utf8'));
			const cwd = process.cwd();
			for (const site of Object.values(sites)) {
				if (cwd.startsWith(site.path)) {
					siteUrl = `http://${site.domain}`;
					break;
				}
			}
		} catch {}

		if (!siteUrl) {
			console.error('Could not detect site URL. Use --site-url or run from Local\'s site shell.');
			process.exit(1);
		}
	}
}

// Ensure URL has no trailing slash
siteUrl = siteUrl.replace(/\/+$/, '');

const runId = `profiler_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
const k6BinPath = path.join(os.homedir(), '.local', 'bin', 'k6');
const k6ScriptPath = path.join(os.homedir(), '.wp-profiler-cache', `k6-script-${runId}.js`);

// ---------------------------------------------------------------------------
// k6 script generation
// ---------------------------------------------------------------------------

function generateK6Script(phase, vus, phaseRunId) {
	const options = phase === 'baseline'
		? `vus: 1,
	iterations: ${baselineRequests},`
		: `stages: [
		{ duration: '${rampUp}', target: ${vus} },
		{ duration: '${parseDurationMinusRamp(duration)}', target: ${vus} },
		{ duration: '${rampUp}', target: 0 },
	],`;

	const loginSetup = username && password ? `
	// Authenticate to get session cookies
	const loginRes = http.post(\`\${BASE_URL}/wp-login.php\`, {
		log: '${username}',
		pwd: '${password}',
		'wp-submit': 'Log In',
		redirect_to: '/',
		testcookie: '1',
	}, {
		redirects: 0,
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	});
	` : '';

	return `
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = '${siteUrl}';
const RUN_ID = '${phaseRunId}';
const URLS = ${JSON.stringify(urls)};
const profiledRequests = new Counter('profiled_requests');
const errorCount = new Counter('error_count');

export const options = {
	${options}
	insecureSkipTLSVerify: true,
	thresholds: {
		http_req_failed: ['rate<1'],  // don't abort on errors, just track
	},
};

export default function () {
	${loginSetup}

	for (const urlPath of URLS) {
		const headers = {
			'X-Profile-Request': '1',
			'X-Run-ID': RUN_ID,
			'X-Request-ID': \`req_\${__VU}_\${__ITER}_\${Date.now()}\`,
		};
		profiledRequests.add(1);

		const res = http.get(\`\${BASE_URL}\${urlPath}\`, { headers });

		const ok = check(res, {
			'status is 200': (r) => r.status === 200,
		});

		if (!ok) {
			errorCount.add(1);
		}

		// Simulate realistic user think time (1-3s)
		sleep(Math.random() * 2 + 1);
	}
}
`;
}

function parseDurationSeconds(dur) {
	const match = dur.match(/^(\d+)(s|m|h)$/);
	if (!match) return parseInt(dur, 10) || 10;
	let s = parseInt(match[1], 10);
	if (match[2] === 'm') s *= 60;
	if (match[2] === 'h') s *= 3600;
	return s;
}

function parseDurationMinusRamp(dur) {
	const total = parseDurationSeconds(dur);
	const rampSec = parseDurationSeconds(rampUp);
	const sustained = Math.max(1, total - rampSec * 2);
	return `${sustained}s`;
}

// Validate: duration must be greater than 2x ramp-up
if (parseDurationSeconds(duration) <= parseDurationSeconds(rampUp) * 2) {
	const r = parseDurationSeconds(rampUp);
	console.error(`Error: --duration (${duration}) must be greater than 2x --ramp-up (${rampUp}).`);
	console.error(`  The test needs time for: ramp-up + sustained load + ramp-down.`);
	console.error(`  Try: --duration ${r * 3}s --ramp-up ${rampUp}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Run coordination
// ---------------------------------------------------------------------------

let activeK6Process = null;

// Kill k6 on Ctrl+C or termination
process.on('SIGINT', () => {
	if (activeK6Process) {
		activeK6Process.kill('SIGTERM');
	}
	console.log(`\n${COLORS.yellow}Interrupted.${COLORS.reset}`);
	try { fs.unlinkSync(k6ScriptPath); } catch {}
	process.exit(1);
});

process.on('SIGTERM', () => {
	if (activeK6Process) {
		activeK6Process.kill('SIGTERM');
	}
	try { fs.unlinkSync(k6ScriptPath); } catch {}
	process.exit(1);
});

function runK6(phase, vus, phaseRunId) {
	const script = generateK6Script(phase, vus, phaseRunId);
	fs.writeFileSync(k6ScriptPath, script);

	const summaryPath = path.join(os.homedir(), '.wp-profiler-cache', `k6-summary-${phaseRunId}.json`);

	return new Promise((resolve, reject) => {
		const child = spawn(k6BinPath, [
			'run',
			'--summary-export', summaryPath,
			k6ScriptPath,
		], {
			stdio: ['pipe', 'inherit', 'inherit'],
		});
		activeK6Process = child;

		child.on('close', (code) => {
			activeK6Process = null;
			try { fs.unlinkSync(k6ScriptPath); } catch {}

			let summary = null;
			try {
				summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
				fs.unlinkSync(summaryPath);
			} catch {}

			if (code !== 0 && !summary) {
				reject(new Error(`k6 exited with code ${code}`));
			} else {
				resolve(summary);
			}
		});

		child.on('error', (err) => {
			activeK6Process = null;
			try { fs.unlinkSync(k6ScriptPath); } catch {}
			reject(err);
		});
	});
}

function collectProfilingData(phaseRunId) {
	// Read profile files directly from the site's wp-content/profiler-runs/ directory.
	// This is more reliable than the REST API because it avoids SSL and auth issues.
	const sitePath = detectSitePath();
	if (!sitePath) {
		console.error('  Warning: Could not detect site path for profile collection');
		return { requests: [] };
	}

	const runDir = path.join(sitePath, 'app', 'public', 'wp-content', 'profiler-runs', phaseRunId);
	if (!fs.existsSync(runDir)) {
		return { requests: [] };
	}

	const files = fs.readdirSync(runDir).filter(f => f.endsWith('.json'));
	const requests = [];

	for (const file of files) {
		try {
			const data = JSON.parse(fs.readFileSync(path.join(runDir, file), 'utf8'));
			requests.push(data);
		} catch {
			// Skip corrupt files
		}
	}

	return { requests };
}

function detectSitePath() {
	// Try common approaches to find the site's root path
	// 1. Check if we're inside a Local site directory
	let dir = process.cwd();
	while (dir !== path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, 'app', 'public', 'wp-config.php'))) {
			return dir;
		}
		dir = path.dirname(dir);
	}

	// 2. Use wp-cli to get ABSPATH and derive site path
	try {
		const abspath = execFileSync('wp', ['eval', 'echo ABSPATH;'], {
			encoding: 'utf8',
			timeout: 10000,
		}).trim();
		// ABSPATH ends with /app/public/ -- go up two levels
		if (abspath.includes('/app/public')) {
			return abspath.replace(/\/app\/public\/?$/, '');
		}
	} catch {}

	return null;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

const COLORS = {
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
	magenta: '\x1b[35m',
	blue: '\x1b[34m',
	dim: '\x1b[2m',
	bold: '\x1b[1m',
	underline: '\x1b[4m',
	reset: '\x1b[0m',
};

// Disable colors if not a TTY
if (!process.stdout.isTTY) {
	Object.keys(COLORS).forEach(k => COLORS[k] = '');
}

function statusColor(status) {
	switch (status) {
		case 'PROBLEM': return COLORS.red;
		case 'WARNING': return COLORS.yellow;
		case 'MODERATE': return COLORS.cyan;
		default: return COLORS.green;
	}
}

function classifyScaling(ratio) {
	if (ratio >= 6) return 'PROBLEM';
	if (ratio >= 3) return 'WARNING';
	if (ratio >= 1.5) return 'MODERATE';
	return 'OK';
}

function formatMs(us) {
	if (us === undefined || us === null) return '--';
	const ms = us / 1000;
	if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
	if (ms >= 1) return `${Math.round(ms)}ms`;
	return `${ms.toFixed(1)}ms`;
}

function formatPercent(value, total) {
	if (!total) return '--';
	return `${((value / total) * 100).toFixed(1)}%`;
}

function padRight(str, len) {
	str = String(str);
	return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
	str = String(str);
	return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

function extractK6Metrics(summary) {
	if (!summary || !summary.metrics) return null;
	const m = summary.metrics;
	return {
		totalRequests: m.http_reqs?.count || 0,
		failedRequests: m.http_req_failed?.passes || 0,
		reqPerSec: m.http_reqs?.rate || 0,
		avgLatency: m.http_req_duration?.avg || 0,
		minLatency: m.http_req_duration?.min || 0,
		maxLatency: m.http_req_duration?.max || 0,
		p50: m.http_req_duration?.['p(50)'] || 0,
		p90: m.http_req_duration?.['p(90)'] || 0,
		p95: m.http_req_duration?.['p(95)'] || 0,
		p99: m.http_req_duration?.['p(99)'] || 0,
	};
}

function printReport(baselineData, loadData, baselineSummary, loadSummary) {
	const baseReqs = baselineData.requests || [];
	const loadReqs = loadData.requests || [];
	const baseK6 = extractK6Metrics(baselineSummary);
	const loadK6 = extractK6Metrics(loadSummary);

	// Aggregate calls by plugin
	const baselineByPlugin = aggregateByPlugin(baseReqs);
	const loadByPlugin = aggregateByPlugin(loadReqs);

	// Merge plugin lists
	const allPlugins = new Set([...Object.keys(baselineByPlugin), ...Object.keys(loadByPlugin)]);
	const pluginSummary = [];

	for (const plugin of allPlugins) {
		const base = baselineByPlugin[plugin] || { totalWt: 0, totalCpu: 0, totalMu: 0 };
		const load = loadByPlugin[plugin] || { totalWt: 0, totalCpu: 0, totalMu: 0 };
		const reqCount = Math.max(loadReqs.length, 1);
		const baseReqCount = Math.max(baseReqs.length, 1);
		const loadPerReq = load.totalWt / reqCount;
		const basePerReq = base.totalWt / baseReqCount;
		const loadCpuPerReq = load.totalCpu / reqCount;
		const baseCpuPerReq = base.totalCpu / baseReqCount;
		const loadMuPerReq = load.totalMu / reqCount;
		const baseMuPerReq = base.totalMu / baseReqCount;
		const ratio = basePerReq > 0 ? loadPerReq / basePerReq : 0;
		const status = classifyScaling(ratio);

		pluginSummary.push({
			name: plugin,
			baseWt: basePerReq,
			loadWt: loadPerReq,
			baseCpu: baseCpuPerReq,
			loadCpu: loadCpuPerReq,
			baseMu: baseMuPerReq,
			loadMu: loadMuPerReq,
			ratio,
			status,
		});
	}

	// Sort by load time descending
	pluginSummary.sort((a, b) => b.loadWt - a.loadWt);
	const totalLoadTime = pluginSummary.reduce((sum, p) => sum + p.loadWt, 0);

	// Aggregate hotspots
	const baselineHotspots = aggregateHotspots(baseReqs);
	const loadHotspots = aggregateHotspots(loadReqs);
	const hotspots = mergeHotspots(baselineHotspots, loadHotspots, loadReqs.length, baseReqs.length);
	hotspots.sort((a, b) => b.loadWt - a.loadWt);

	// Get metadata
	const baselineMeta = baseReqs[0]?.meta || {};

	// -- Print report --
	const line = '='.repeat(78);
	const thinLine = '-'.repeat(78);

	console.log(`\n${COLORS.bold}${line}`);
	console.log(`  WP Profiler Report -- ${siteUrl}`);
	console.log(`  ${new Date().toLocaleString()}`);
	console.log(`${line}${COLORS.reset}\n`);

	// Test setup
	console.log(`${COLORS.bold}TEST SETUP${COLORS.reset}`);
	console.log(`  Baseline:    1 virtual user, ${baselineRequests} requests (warm)`);
	console.log(`  Load test:   ${users} virtual users, ${duration}, ramp-up ${rampUp}`);
	console.log(`  Think time:  1-3s random (simulates real user behavior)`);
	console.log(`  URLs tested: ${urls.join(', ')}`);
	console.log(`  Profiled:    ${baseReqs.length} baseline + ${loadReqs.length} under load\n`);

	// Performance section (k6 metrics)
	if (loadK6 || baseK6) {
		console.log(`${COLORS.bold}${COLORS.blue}PERFORMANCE${COLORS.reset}`);
		console.log(`${COLORS.dim}  HTTP response times and throughput from k6.${COLORS.reset}\n`);

		const fmtMs = (v) => v ? `${Math.round(v)}ms` : '--';
		const successRate = loadK6 && loadK6.totalRequests > 0
			? ((loadK6.totalRequests - loadK6.failedRequests) / loadK6.totalRequests * 100).toFixed(1)
			: '--';

		console.log(`  ${''.padEnd(20)} ${padLeft('Baseline', 12)} ${padLeft('Under Load', 12)}`);
		console.log(`  ${'-'.repeat(20)} ${'-'.repeat(12)} ${'-'.repeat(12)}`);
		console.log(`  ${padRight('Total Requests', 20)} ${padLeft(baseK6?.totalRequests || '--', 12)} ${padLeft(loadK6?.totalRequests || '--', 12)}`);
		console.log(`  ${padRight('Failed', 20)} ${padLeft(baseK6?.failedRequests || '0', 12)} ${padLeft(loadK6?.failedRequests || '0', 12)}`);
		console.log(`  ${padRight('Requests/sec', 20)} ${padLeft(baseK6?.reqPerSec?.toFixed(1) || '--', 12)} ${padLeft(loadK6?.reqPerSec?.toFixed(1) || '--', 12)}`);
		console.log(`  ${padRight('Avg Latency', 20)} ${padLeft(fmtMs(baseK6?.avgLatency), 12)} ${padLeft(fmtMs(loadK6?.avgLatency), 12)}`);
		console.log(`  ${padRight('P50 (median)', 20)} ${padLeft(fmtMs(baseK6?.p50), 12)} ${padLeft(fmtMs(loadK6?.p50), 12)}`);
		console.log(`  ${padRight('P90', 20)} ${padLeft(fmtMs(baseK6?.p90), 12)} ${padLeft(fmtMs(loadK6?.p90), 12)}`);
		console.log(`  ${padRight('P95', 20)} ${padLeft(fmtMs(baseK6?.p95), 12)} ${padLeft(fmtMs(loadK6?.p95), 12)}`);
		console.log(`  ${padRight('P99', 20)} ${padLeft(fmtMs(baseK6?.p99), 12)} ${padLeft(fmtMs(loadK6?.p99), 12)}`);
		console.log(`  ${padRight('Min / Max', 20)} ${padLeft(fmtMs(baseK6?.minLatency) + ' / ' + fmtMs(baseK6?.maxLatency), 12)} ${padLeft(fmtMs(loadK6?.minLatency) + ' / ' + fmtMs(loadK6?.maxLatency), 12)}`);

		if (loadK6 && loadK6.failedRequests > 0) {
			console.log(`\n  ${COLORS.red}${loadK6.failedRequests} requests failed (${(100 - parseFloat(successRate)).toFixed(1)}% error rate)${COLORS.reset}`);
		}
		console.log('');
	}

	// Overview
	console.log(`${COLORS.bold}OVERVIEW${COLORS.reset}`);
	console.log(`  DB queries/request:  ${baselineMeta.queries || '--'}`);
	if (baselineMeta.hooks_fired) {
		console.log(`  Hooks fired:         ${baselineMeta.hooks_fired}`);
	}
	console.log('');

	// Plugin summary table
	console.log(`${COLORS.bold}${COLORS.cyan}SLOWEST PLUGINS${COLORS.reset}`);
	console.log(`${COLORS.dim}  Which plugins/themes consume the most execution time per request under load.${COLORS.reset}\n`);
	console.log(`  ${padRight('#', 4)} ${padRight('Plugin/Theme', 28)} ${padLeft('Wall Time', 10)} ${padLeft('CPU', 10)} ${padLeft('Memory', 10)} ${padLeft('Share', 7)} ${padLeft('Degrad.', 9)} ${'Status'}`);
	console.log(`  ${'-'.repeat(4)} ${'-'.repeat(28)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(7)} ${'-'.repeat(9)} ${'-'.repeat(10)}`);

	const filteredPluginSummary = pluginSummary;

	filteredPluginSummary.slice(0, topN).forEach((p, i) => {
		const color = statusColor(p.status);
		const ratioStr = p.ratio > 0 ? `${p.ratio.toFixed(1)}x` : '--';
		console.log(
			`  ${padRight(i + 1 + '.', 4)} ${padRight(p.name, 28)} ${padLeft(formatMs(p.loadWt), 10)} ${padLeft(formatMs(p.loadCpu), 10)} ${padLeft(formatBytes(p.loadMu), 10)} ${padLeft(formatPercent(p.loadWt, totalLoadTime), 7)} ${padLeft(ratioStr, 9)} ${color}${p.status}${COLORS.reset}`,
		);
	});

	console.log(`\n  ${COLORS.dim}Wall Time = total time including I/O waits | CPU = actual processing time`);
	console.log(`  Degrad. = wall time under load vs baseline (PROBLEM > 6x | WARNING 3-6x | MODERATE 1.5-3x | OK < 1.5x)${COLORS.reset}\n`);

	// Scaling Breakdown -- grouped by plugin, only for flagged plugins
	// For each PROBLEM/WARNING/MODERATE plugin, show the functions inside it
	// that degrade, sorted by worst scaling ratio
	const flaggedPlugins = pluginSummary.filter(
		p => p.status === 'PROBLEM' || p.status === 'WARNING' || p.status === 'MODERATE'
	);

	if (flaggedPlugins.length > 0) {
		console.log(`${thinLine}\n`);
		console.log(`${COLORS.bold}${COLORS.magenta}SCALING BREAKDOWN${COLORS.reset}`);
		console.log(`${COLORS.dim}  For each flagged plugin, the specific functions that degrade under concurrent traffic.${COLORS.reset}`);
		console.log(`${COLORS.dim}  Bottleneck: Wall = I/O contention (DB locks, network) | CPU = processing | Memory = allocation${COLORS.reset}\n`);

		const fmtRatio = (r) => r > 0 ? `${r.toFixed(1)}x` : '--';

		for (const plugin of flaggedPlugins) {
			const pluginHotspots = hotspots
				.filter(h => h.plugin === plugin.name && h.ratio >= 1.5)
				.sort((a, b) => b.ratio - a.ratio);

			const color = statusColor(plugin.status);
			console.log(`  ${color}${COLORS.bold}${plugin.name}${COLORS.reset} ${color}(${fmtRatio(plugin.ratio)} ${plugin.status})${COLORS.reset}`);

			if (pluginHotspots.length === 0) {
				console.log(`  ${COLORS.dim}  No individual functions show significant degradation.`);
				console.log(`  The slowdown is spread across many small calls within this plugin.${COLORS.reset}\n`);
				continue;
			}

			console.log(`  ${padRight('', 4)} ${padRight('Function', 40)} ${padLeft('Wall', 7)} ${padLeft('CPU', 7)} ${padLeft('Mem', 7)} ${padLeft('Worst', 7)} ${'Bottleneck'}`);
			console.log(`  ${'-'.repeat(4)} ${'-'.repeat(40)} ${'-'.repeat(7)} ${'-'.repeat(7)} ${'-'.repeat(7)} ${'-'.repeat(7)} ${'-'.repeat(12)}`);

			pluginHotspots.slice(0, topN).forEach((h, i) => {
				let bottleneck = 'Wall';
				let worstVal = h.ratioWt;
				if (h.ratioCpu > worstVal) { bottleneck = 'CPU'; worstVal = h.ratioCpu; }
				if (h.ratioMu > worstVal) { bottleneck = 'Memory'; worstVal = h.ratioMu; }

				const rowColor = statusColor(classifyScaling(h.ratio));
				console.log(
					`  ${padRight(i + 1 + '.', 4)} ${padRight(h.func, 40)} ${padLeft(fmtRatio(h.ratioWt), 7)} ${padLeft(fmtRatio(h.ratioCpu), 7)} ${padLeft(fmtRatio(h.ratioMu), 7)} ${rowColor}${padLeft(fmtRatio(h.ratio), 7)}${COLORS.reset} ${bottleneck}`,
				);
				if (h.file) {
					console.log(`       ${COLORS.dim}-> ${h.file}${COLORS.reset}`);
				}
			});

			// Diagnosis: summarize the dominant bottleneck for this plugin
			const wallCount = pluginHotspots.filter(h => h.ratioWt >= h.ratioCpu && h.ratioWt >= h.ratioMu).length;
			const cpuCount = pluginHotspots.filter(h => h.ratioCpu > h.ratioWt && h.ratioCpu >= h.ratioMu).length;
			const memCount = pluginHotspots.filter(h => h.ratioMu > h.ratioWt && h.ratioMu > h.ratioCpu).length;
			const dominant = wallCount >= cpuCount && wallCount >= memCount ? 'Wall time'
				: cpuCount >= memCount ? 'CPU' : 'Memory';

			const diagnosisMap = {
				'Wall time': 'Database queries or external I/O from this plugin are contending for locks under concurrent traffic.',
				'CPU': 'This plugin does heavy processing (serialization, regex, loops) that compounds with concurrent requests.',
				'Memory': 'Each concurrent request allocates significant memory in this plugin, causing pressure under load.',
			};

			console.log(`\n  ${COLORS.dim}  Diagnosis: ${dominant} is the primary bottleneck.`);
			console.log(`  ${diagnosisMap[dominant]}${COLORS.reset}\n`);
		}
	}

	// If no plugins are flagged, show a success message
	if (flaggedPlugins.length === 0) {
		console.log(`${thinLine}\n`);
		console.log(`  ${COLORS.green}${COLORS.bold}All plugins scale well under the tested load.${COLORS.reset}\n`);
	}

	console.log(`${line}\n`);
}

// ---------------------------------------------------------------------------
// Data aggregation helpers
// ---------------------------------------------------------------------------

function aggregateByPlugin(requests) {
	const byPlugin = {};

	for (const req of requests) {
		const calls = req.calls || [];
		for (const call of calls) {
			// Skip WordPress core -- only show plugins and themes
			if (call.caller_type === 'core' || call.caller_name === 'wordpress') continue;
			const name = call.caller_name || 'unknown';
			if (!byPlugin[name]) {
				byPlugin[name] = { totalWt: 0, totalCpu: 0, totalMu: 0 };
			}
			byPlugin[name].totalWt += call.inclusive_wall_time_us || 0;
			byPlugin[name].totalCpu += call.inclusive_cpu_us || 0;
			byPlugin[name].totalMu += call.inclusive_memory_bytes || 0;
		}
	}

	return byPlugin;
}

function formatBytes(bytes) {
	if (bytes === undefined || bytes === null) return '--';
	const abs = Math.abs(bytes);
	if (abs < 1) return '--';
	const sign = bytes < 0 ? '-' : '';
	if (abs >= 1024 * 1024) return `${sign}${(abs / (1024 * 1024)).toFixed(1)}MB`;
	if (abs >= 1024) return `${sign}${(abs / 1024).toFixed(0)}KB`;
	return `${sign}${Math.round(abs)}B`;
}

function aggregateHotspots(requests) {
	const byKey = {};

	for (const req of requests) {
		const calls = req.calls || [];
		for (const call of calls) {
			// Skip WordPress core -- only show plugins and themes
			if (call.caller_type === 'core' || call.caller_name === 'wordpress') continue;
			const key = `${call.caller_name}::${call.function}::${call.caller_file}:${call.caller_line}`;
			if (!byKey[key]) {
				byKey[key] = {
					plugin: call.caller_name || 'unknown',
					func: call.function || 'unknown',
					file: call.caller_file
						? `${call.caller_file}:${call.caller_line || '?'}`
						: null,
					totalWt: 0,
					totalCpu: 0,
					totalMu: 0,
					calls: 0,
					patterns: call.patterns || [],
				};
			}
			byKey[key].totalWt += call.inclusive_wall_time_us || 0;
			byKey[key].totalCpu += call.inclusive_cpu_us || 0;
			byKey[key].totalMu += call.inclusive_memory_bytes || 0;
			byKey[key].calls += call.call_count || 1;
		}
	}

	return byKey;
}

function mergeHotspots(baselineMap, loadMap, loadRequestCount, baseRequestCount) {
	const allKeys = new Set([...Object.keys(baselineMap), ...Object.keys(loadMap)]);
	const result = [];

	for (const key of allKeys) {
		const base = baselineMap[key];
		const load = loadMap[key];

		const baseWt = base ? base.totalWt / Math.max(baseRequestCount || 1, 1) : 0;
		const loadWt = load ? load.totalWt / Math.max(loadRequestCount, 1) : 0;
		const baseCpu = base ? base.totalCpu / Math.max(baseRequestCount || 1, 1) : 0;
		const loadCpu = load ? load.totalCpu / Math.max(loadRequestCount, 1) : 0;
		const baseMu = base ? base.totalMu / Math.max(baseRequestCount || 1, 1) : 0;
		const loadMu = load ? load.totalMu / Math.max(loadRequestCount, 1) : 0;
		const ratioWt = baseWt > 0 ? loadWt / baseWt : 0;
		const ratioCpu = baseCpu > 0 ? loadCpu / baseCpu : 0;
		const ratioMu = (baseMu > 0 && loadMu > 0) ? loadMu / baseMu : 0;
		// Worst of all three ratios determines the verdict
		const ratio = Math.max(ratioWt, ratioCpu, ratioMu);

		result.push({
			plugin: (load || base).plugin,
			func: (load || base).func,
			file: (load || base).file,
			baseWt,
			loadWt,
			baseCpu,
			loadCpu,
			baseMu,
			loadMu,
			ratioWt,
			ratioCpu,
			ratioMu,
			calls: (load || base).calls,
			ratio,
			patterns: (load || base).patterns || [],
		});
	}

	return result;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	console.log(`\n${COLORS.bold}WP Profiler${COLORS.reset}`);
	console.log(`  Site: ${siteUrl}`);
	console.log(`  Run ID: ${runId}\n`);

	// xhprof overhead warning
	console.log(`  ${COLORS.dim}Note: xhprof profiling adds ~5-15% overhead to each request.`);
	console.log(`  Absolute timings are inflated, but relative comparisons (degradation`);
	console.log(`  ratios) remain valid since both phases have the same overhead.${COLORS.reset}\n`);

	// Clean up old profiling data from previous runs
	const sitePath = detectSitePath();
	if (sitePath) {
		const runsDir = path.join(sitePath, 'app', 'public', 'wp-content', 'profiler-runs');
		if (fs.existsSync(runsDir)) {
			const oldRuns = fs.readdirSync(runsDir).filter(d => d !== '.' && d !== '..');
			if (oldRuns.length > 0) {
				for (const old of oldRuns) {
					fs.rmSync(path.join(runsDir, old), { recursive: true, force: true });
				}
				console.log(`  Cleaned up ${oldRuns.length} previous run(s).\n`);
			}
		}
	}

	// Phase A: Baseline (warm requests)
	const baselineRunId = `${runId}_baseline`;
	console.log(`${COLORS.bold}Phase A: Baseline${COLORS.reset} (1 virtual user, ${baselineRequests} requests)`);
	console.log('  Running...');
	const baselineSummary = await runK6('baseline', 1, baselineRunId);
	await sleep(2000);
	console.log('  Collecting profiling data...');
	const baselineData = collectProfilingData(baselineRunId);
	console.log(`  Collected ${(baselineData.requests || []).length} profiled request(s).\n`);

	// Phase B: Load test (gradual ramp-up)
	const loadRunId = `${runId}_load`;
	console.log(`${COLORS.bold}Phase B: Load Test${COLORS.reset} (${users} virtual users, ${duration}, ramp-up ${rampUp})`);
	console.log('  Running...');
	const loadSummary = await runK6('load', users, loadRunId);
	await sleep(3000);
	console.log('  Collecting profiling data...');
	const loadData = collectProfilingData(loadRunId);
	console.log(`  Collected ${(loadData.requests || []).length} profiled request(s).\n`);

	// Report
	printReport(baselineData, loadData, baselineSummary, loadSummary);
}

main().catch((err) => {
	console.error(`\n${COLORS.red}Error: ${err.message}${COLORS.reset}`);
	process.exit(1);
});
