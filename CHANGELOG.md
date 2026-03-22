# Changelog

## Version 1.9 -- [`760ffdd`](../../commit/760ffdde26aa26814073357f82b84296b1887e47)

### Conflict Testing

- Added "Conflict Testing" panel under the Tools tab for quick plugin conflict testing
- Displays all active/inactive plugins in a table with DB status indicator and Active toggle
- Toggling a plugin on/off uses the `option_active_plugins` filter hook via an mu-plugin -- no database modifications
- Override state stored in `wp-content/conflict-test-overrides.json` on disk
- **Cascade deactivation**: deactivating a plugin (e.g. WooCommerce) automatically deactivates all plugins that depend on it
- **Cascade activation**: activating a dependent plugin (e.g. Google Listings & Ads) automatically activates its required plugins
- Dependency detection via WordPress 6.5+ `RequiresPlugins` header, fetched at load time and cached
- "Reset All" button clears all overrides and restores original DB state
- Retry button when site is not running
- Deployed `wp-conflict-tester.php` mu-plugin alongside the profiler agent
- Added 4 IPC channels: `GET_PLUGIN_LIST`, `GET_CONFLICT_OVERRIDES`, `SET_CONFLICT_OVERRIDE`, `CLEAR_CONFLICT_OVERRIDES`
- Added `PluginInfo`, `ConflictOverrides`, `PluginDependencyMap` types

## Version 1.8 -- [`1526857`](../../commit/152685752b30021589bbc2b7952ad7ac0dce48c7)

### Two-phase load test runner CLI

- Added `wp-profiler` CLI command available in Local's site shell via symlink at `~/.local/bin/wp-profiler`
- Two-phase load testing: Phase A (baseline, 5 warm requests with 1 VU) then Phase B (N concurrent VUs with gradual ramp-up)
- Realistic think time (1-3s random delay between requests) to simulate real user behavior
- k6 metrics: P50/P90/P95/P99 latency, throughput (req/sec), error rate, displayed side-by-side for baseline vs load
- xhprof profiling on all requests in both phases (no sampling asymmetry)
- Auto-detects site URL from Local's `sites.json` based on current working directory
- Deploys mu-plugin symlink automatically if missing
- Cleans up previous profiling data before each run
- k6 progress output streamed live to terminal
- Ctrl+C kills k6 process cleanly
- Duration must be greater than 2x ramp-up (validated with helpful error message)
- xhprof overhead warning displayed before tests start

### Report output

- **PERFORMANCE** section with HTTP response times and throughput from k6 (baseline vs load side-by-side)
- **SLOWEST PLUGINS** table with wall time, CPU, memory, share %, degradation ratio per plugin
- **SCALING BREAKDOWN** replacing the old hotspot/worst-scaling tables -- groups functions by plugin, only for flagged plugins (PROBLEM/WARNING/MODERATE), with per-metric ratios (Wall/CPU/Mem), bottleneck label, and auto-generated diagnosis
- Degradation ratio calculated as worst of wall time, CPU, and memory ratios
- Success message when all plugins scale well
- Memory formatting fixed for small/negative byte values
- Full file paths in function call details
- Color-coded table headers (cyan/magenta/yellow) with descriptions

### CLI arguments

- `--users` (default 50), `--duration` (default 10s), `--ramp-up` (default 5s)
- `--urls` (space-separated paths), `--username`/`--password` (WP auth)
- `--top` (rows per table), `--baseline-requests` (default 5)
- `--site-url` (auto-detected), `--help`
- Supports both `--flag value` and `--flag=value` syntax

## Version 1.7 -- [`3c39252`](../../commit/3c3925216ca17f1d9abc94190d6190baae14d4d3)

### Profiler agent mu-plugin

- Added `wp-profiler-agent.php` mu-plugin deployed as step 3 of Setup Profiler
- Canonical copy written to `~/.wp-profiler/mu-plugin/`, symlinked into each site's `wp-content/mu-plugins/`
- Zero overhead on normal requests -- only activates when `X-Profile-Request: 1` header is present
- Starts xhprof profiling before regular plugins/themes load (mu-plugin execution order)
- Collects per-request data on shutdown via `register_shutdown_function()`
- Call-site attribution via Reflection -- resolves function names to file paths and classifies as plugin/theme/mu-plugin/core
- Query argument capture via `pre_get_posts` hook -- records `posts_per_page`, `post_type`, and caller for every WP_Query
- Slow query logging when `SAVEQUERIES` is enabled (queries > 10ms)
- Pattern detection: flags `EXTERNAL_HTTP_CALL` and `EXCESSIVE_OPTION_READS`
- Writes JSON to `wp-content/profiler-runs/{run_id}/{request_id}.json`
- REST endpoints: `GET /wp-json/profiler/v1/runs` (list runs) and `GET /wp-json/profiler/v1/runs/{run_id}` (get run data)
- Added `muPlugin` field to `ProfilerSetupStatus` type and verification checklist UI
- Build script updated to copy `.php` file into `lib/` since tsc only compiles TypeScript

## Version 1.6 -- [`0a477fb`](../../commit/0a477fb39437ed1e56cb3a9302a531770a7721fe)

### WP Profiler setup infrastructure

- Added "WP Profiler" row under the Tools tab (`siteInfoUtilities` hook) with a one-click "Setup Profiler" button
- Compiles xhprof PHP extension from source against Local's lightning-services PHP and caches the `.so` per PHP version at `~/.wp-profiler-cache/xhprof/{version}/`
- Downloads k6 load test binary from GitHub releases to `~/.local/bin/k6` with OS-specific archive handling (`.zip` on macOS/Windows, `.tar.gz` on Linux)
- Live log panel streams installation progress to the UI in real time via `PROFILER_SETUP_LOG` push events
- Post-install verification checklist shows status of each tool with green/red indicators
- Setup is idempotent -- skips already-installed tools on re-run

### Electron environment workarounds

- Patched Local's phpize/php-config at runtime to replace hardcoded CI build paths (`/Users/distiller/project/...`) with actual install paths
- Created space-free symlinks to work around phpize rejecting paths containing spaces ("Application Support")
- All compilation steps run through the user's login shell (`/bin/zsh -l -c`) so autoconf, make, and gcc are on PATH -- Electron doesn't inherit the user's shell PATH
- Downloads missing `pcre2.h` header from PCRE2 GitHub before compiling -- Local's PHP headers reference it but don't ship it
- Uses `{{extensionsDir}}/xhprof.so` in `php.ini.hbs` (Handlebars template variable) so Local resolves the path at runtime, avoiding spaces-in-path issues
- Verifies installation by checking `.so` existence and ini config rather than running PHP CLI (which doesn't load the site's config)

### Files added

- `src/features/profiler-setup/profiler-setup.service.ts` -- pure functions for xhprof compilation, k6 download, path helpers, status checks
- `src/features/profiler-setup/profiler-setup.service.test.ts` -- service unit tests
- `src/features/profiler-setup/profiler-setup.ipc.ts` -- IPC handler registration (GET_PROFILER_STATUS, RUN_PROFILER_SETUP)
- `src/features/profiler-setup/profiler-setup.ipc.test.ts` -- IPC handler tests
- `src/features/profiler-setup/profiler-setup.hooks.tsx` -- renderer hook registration on `siteInfoUtilities`
- `src/features/profiler-setup/ProfilerSetupPanel.tsx` -- React component with setup button, log panel, verification checklist
- `src/test/mockLocal.ts` -- mock for `@getflywheel/local` core types (SiteServiceRole enum)

### Files modified

- `src/shared/types.ts` -- added 4 IPC channels, `ProfilerCache`, `ToolStatus`, `ToolCheckResult`, `ProfilerSetupStatus` types, extended `SuperchargedCache`
- `src/main.ts` -- wired `registerProfilerSetupIpc` with `lightningServices` and `siteProcessManager`
- `src/renderer.tsx` -- wired `registerProfilerSetupHooks`
- `src/test/mockCreators.ts` -- added `createMockLightningService`, `createMockLightningServices`, `createMockSiteProcessManager`, extended `createMockSite` with `paths.conf` and `paths.confTemplates`
- `jest.config.js` -- added `@getflywheel/local` module mapping

## Version 1.5 -- [`080ed82`](../../commit/080ed8287ee2bfd36e769023c12b3b6f28a6ad9d)

### ngrok URL override feature ([`779fafb`](../../commit/779fafb8bc17064ba1658ea360064737b4965ba0))

- Added ngrok feature to override WP_HOME and WP_SITEURL with an ngrok tunnel URL
- New `ngrok` row on the Site Info Overview page with URL input, Save, and Clear buttons
- Save persists the ngrok URL to SiteJSON cache without touching wp-config.php
- Enable/disable writes or removes `WP_HOME` and `WP_SITEURL` constants via WP-CLI
- URL collision detection -- enabling an ngrok URL on one site automatically disables it on any other site using the same URL, removes their wp-config.php constants, and notifies the renderer
- Clear removes the URL mapping and wp-config.php constants in one step
- Added `ngrok.service.ts` with `setNgrokConstants`, `removeNgrokConstants`, `readNgrokCache`, `writeNgrokCache`, `clearNgrokCache`, `findConflictingSites`
- Added `NgrokCache` type and `NGROK_CONSTANTS` tuple to `shared/types.ts`
- Added 5 IPC channels: `GET_NGROK`, `APPLY_NGROK`, `ENABLE_NGROK`, `CLEAR_NGROK`, `NGROK_CHANGED`
- Fixed `debug-constants.service.ts` `writeCache` to preserve existing `superchargedAddon` fields when writing debug constants

### Start/Stop tunnel from the UI ([`da295a6`](../../commit/da295a6b10ee80a7d86a18092135c0646df43e12), [`e0ed0d7`](../../commit/e0ed0d74c262132ec7f320172385bbe3ab08a54b), [`080ed82`](../../commit/080ed8287ee2bfd36e769023c12b3b6f28a6ad9d))

- Added Start/Stop button to spawn and kill the `ngrok` CLI tunnel process directly from the UI
- Merged the Enable/Disable switch and Start/Stop button into a single Start/Stop button -- clicking Start sets WP_HOME/WP_SITEURL constants and starts the tunnel in one step, Stop does the reverse
- Before starting a tunnel, checks the ngrok agent API (`127.0.0.1:4040/api/tunnels`) and deletes any existing tunnel for the same domain to avoid "endpoint already online" errors
- Added tunnel status indicator (green/gray dot with "Tunnel active"/"Tunnel inactive" label) driven by the ngrok agent API
- Status indicator correctly handles shared ngrok URLs across sites -- only the site with ngrok enabled shows "Tunnel active"
- Error messages from ngrok (auth failures, missing binary, non-zero exits) are captured from stderr and displayed inline in the UI
- Resolved ngrok binary path for Electron by shelling out to the user's login shell (`$SHELL -l -c 'which ngrok'` on macOS/Linux, `where ngrok` on Windows), with fallbacks to common install paths
- When a Local site is stopped, its ngrok tunnel is automatically killed and the cache is updated to `enabled: false`
- Added `ngrok.process.ts` with `startNgrokProcess`, `stopNgrokProcess`, `getNgrokProcessStatus`, `fetchNgrokTunnels`, `findTunnelByDomain`, `deleteTunnel`, `extractDomain`, and `resolveNgrokBin`
- Added 4 new IPC channels: `START_NGROK_PROCESS`, `STOP_NGROK_PROCESS`, `GET_NGROK_PROCESS_STATUS`, `NGROK_PROCESS_STATUS_CHANGED`
- Added `siteStopped` hook in `main.ts` to clean up tunnels when sites are stopped

## Version 1.4.1 -- [`1169967`](../../commit/1169967fc6c6369ad621e20b01a1680fa064d3b8)

- Undefined debug constants now show their WordPress core runtime defaults in the UI instead of `false` -- notably `WP_DEBUG_DISPLAY` shows as `true` when not in wp-config.php
- Added `WP_DEFAULTS` map to `shared/types.ts` matching wp-settings.php: `WP_DEBUG: false`, `WP_DEBUG_LOG: false`, `WP_DEBUG_DISPLAY: true`
- `WP_DEBUG_DISPLAY` is only written to wp-config.php when explicitly set to `false`; setting it to `true` deletes it from the file, letting WordPress use its built-in default
- Added `deleteConstant()` service function using `wp config delete` to remove constants from wp-config.php
- Added `isConstantDefined()` service function to check whether a constant exists in wp-config.php
- SET IPC handler now returns the full `DebugConstantsMap` so the renderer picks up all changes after a set
- Renderer `handleToggle` consumes returned constants to update all switches after a set
- Removed `ignoreErrors: true` from `fetchDebugConstants()` so undefined constants properly throw and fall back to `WP_DEFAULTS`
- Added `CACHE_VERSION` to `SuperchargedCache` to invalidate stale caches from prior versions

## Version 1.4 -- [`a312b42`](../../commit/a312b4252d99048edfaacfee30294078370ee56e)

- Re-architected the addon for separation of concerns and future extensibility
- Extracted shared types, constants, and IPC channel names into `src/shared/types.ts` --single source of truth, no duplication
- Moved pure WP-CLI and cache logic into `src/features/debug-constants/debug-constants.service.ts`
- Encapsulated file watcher state into a factory in `src/features/debug-constants/debug-constants.watcher.ts`
- Isolated IPC handler registration in `src/features/debug-constants/debug-constants.ipc.ts`
- Extracted React component into `src/features/debug-constants/DebugSwitches.tsx` using a factory pattern for `context.React`
- Extracted hook registration into `src/features/debug-constants/debug-constants.hooks.tsx`
- Reduced entry points (`main.ts`, `renderer.tsx`) to thin wiring shells (~20 lines each)
- Future features slot in by adding a new `src/features/<name>/` directory and one import + one call in each entry point

## Version 1.3.2.1 -- [`591dec1`](../../commit/591dec1)

- Added comprehensive JSDoc documentation to `main.ts` and `renderer.tsx`
- Documented file-level overviews, all types/interfaces, helper functions, IPC channels, component lifecycle, and inline logic

## Version 1.3.2 -- [`d86684e`](../../commit/d86684e)

- Fix UI flicker (enable-disable-enable) when toggling a switch
- Suppress `fs.watch` callback during self-initiated `wp config set` writes using a `selfWriting` guard
- Guard is held for 500ms after the write completes to allow OS file events to flush

## Version 1.3.1 -- [`d4f37ed`](../../commit/d4f37ed643b3bef1e99b7e257f0f66c3206835d8)

- Disable individual switch while its WP-CLI `set` call is in flight, re-enable on completion or failure
- Per-constant `updating` state so toggling one switch doesn't block the others

## Version 1.3 -- [`91b446b`](../../commit/91b446b72bcbe007d6c92d2e36d8e0bd6fc8bf2d)

- Auto-update UI when wp-config.php is modified externally (e.g. edited by hand in a text editor)
- Main process uses `fs.watch` to observe wp-config.php per site, managed via `supercharged:watch-site` / `supercharged:unwatch-site` IPC calls
- On file change, re-fetches constants via WP-CLI, updates cache, and pushes new values to the renderer via `sendIPCEvent`
- Renderer listens for `supercharged:debug-constants-changed` on `ipcRenderer` and updates switch states in real time
- Watcher lifecycle tied to component mount/unmount --starts when viewing a site, stops when navigating away

## Version 1.2 -- [`f5c2e0f`](../../commit/f5c2e0fa18db0fab961fbcfb860f75c5c7b37209)

- Invalidate cache when wp-config.php is modified externally (e.g. edited by hand)
- Store a `cachedAt` timestamp alongside cached debug constants
- On cache read, compare `cachedAt` against wp-config.php's `mtime` via a single `fs.statSync` call
- If the file is newer than the cache, discard cache and re-fetch via WP-CLI

## Version 1.1 -- [`c06f624`](../../commit/c06f6244cf56164b506d7fa382e3d9095ae3246c)

- Cache debug constant values on the SiteJSON object at `superchargedAddon.debugConstants` via `siteData.updateSite()`
- On site switch, return cached values instantly without running WP-CLI commands
- On first load (no cache), fetch via WP-CLI and persist to cache
- On toggle, update the cache alongside the `wp config set` call so subsequent visits are instant

## Version 1 -- [`f946962`](../../commit/f94696256ec95ab47c71d2f381d5107f348f84d5)

- Added 3 toggle switches (WP_DEBUG, WP_DEBUG_LOG, WP_DEBUG_DISPLAY) to the Site Info Overview page via the `SiteInfoOverview_TableList` content hook
- Each switch is wrapped in a `TableListRow` with the constant name as its label
- Switches use the `tiny` and `flat` style variants for a compact appearance
- Main process (`main.ts`) listens for IPC calls to get and set wp-config.php constants using the WP-CLI service (`wp config get` / `wp config set --raw --add --path=<site_path>`)
- Renderer process (`renderer.tsx`) fetches current constant values on mount and optimistically updates the UI on toggle, reverting on error
