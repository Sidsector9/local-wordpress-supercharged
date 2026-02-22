# Changelog

## Version 1.4 — [`a312b42`](../../commit/a312b4252d99048edfaacfee30294078370ee56e)

- Re-architected the addon for separation of concerns and future extensibility
- Extracted shared types, constants, and IPC channel names into `src/shared/types.ts` — single source of truth, no duplication
- Moved pure WP-CLI and cache logic into `src/features/debug-constants/debug-constants.service.ts`
- Encapsulated file watcher state into a factory in `src/features/debug-constants/debug-constants.watcher.ts`
- Isolated IPC handler registration in `src/features/debug-constants/debug-constants.ipc.ts`
- Extracted React component into `src/features/debug-constants/DebugSwitches.tsx` using a factory pattern for `context.React`
- Extracted hook registration into `src/features/debug-constants/debug-constants.hooks.tsx`
- Reduced entry points (`main.ts`, `renderer.tsx`) to thin wiring shells (~20 lines each)
- Future features slot in by adding a new `src/features/<name>/` directory and one import + one call in each entry point

## Version 1.3.2.1 — [`591dec1`](../../commit/591dec1)

- Added comprehensive JSDoc documentation to `main.ts` and `renderer.tsx`
- Documented file-level overviews, all types/interfaces, helper functions, IPC channels, component lifecycle, and inline logic

## Version 1.3.2 — [`d86684e`](../../commit/d86684e)

- Fix UI flicker (enable-disable-enable) when toggling a switch
- Suppress `fs.watch` callback during self-initiated `wp config set` writes using a `selfWriting` guard
- Guard is held for 500ms after the write completes to allow OS file events to flush

## Version 1.3.1 — [`d4f37ed`](../../commit/d4f37ed643b3bef1e99b7e257f0f66c3206835d8)

- Disable individual switch while its WP-CLI `set` call is in flight, re-enable on completion or failure
- Per-constant `updating` state so toggling one switch doesn't block the others

## Version 1.3 — [`91b446b`](../../commit/91b446b72bcbe007d6c92d2e36d8e0bd6fc8bf2d)

- Auto-update UI when wp-config.php is modified externally (e.g. edited by hand in a text editor)
- Main process uses `fs.watch` to observe wp-config.php per site, managed via `supercharged:watch-site` / `supercharged:unwatch-site` IPC calls
- On file change, re-fetches constants via WP-CLI, updates cache, and pushes new values to the renderer via `sendIPCEvent`
- Renderer listens for `supercharged:debug-constants-changed` on `ipcRenderer` and updates switch states in real time
- Watcher lifecycle tied to component mount/unmount — starts when viewing a site, stops when navigating away

## Version 1.2 — [`f5c2e0f`](../../commit/f5c2e0fa18db0fab961fbcfb860f75c5c7b37209)

- Invalidate cache when wp-config.php is modified externally (e.g. edited by hand)
- Store a `cachedAt` timestamp alongside cached debug constants
- On cache read, compare `cachedAt` against wp-config.php's `mtime` via a single `fs.statSync` call
- If the file is newer than the cache, discard cache and re-fetch via WP-CLI

## Version 1.1 — [`c06f624`](../../commit/c06f6244cf56164b506d7fa382e3d9095ae3246c)

- Cache debug constant values on the SiteJSON object at `superchargedAddon.debugConstants` via `siteData.updateSite()`
- On site switch, return cached values instantly without running WP-CLI commands
- On first load (no cache), fetch via WP-CLI and persist to cache
- On toggle, update the cache alongside the `wp config set` call so subsequent visits are instant

## Version 1 — [`f946962`](../../commit/f94696256ec95ab47c71d2f381d5107f348f84d5)

- Added 3 toggle switches (WP_DEBUG, WP_DEBUG_LOG, WP_DEBUG_DISPLAY) to the Site Info Overview page via the `SiteInfoOverview_TableList` content hook
- Each switch is wrapped in a `TableListRow` with the constant name as its label
- Switches use the `tiny` and `flat` style variants for a compact appearance
- Main process (`main.ts`) listens for IPC calls to get and set wp-config.php constants using the WP-CLI service (`wp config get` / `wp config set --raw --add --path=<site_path>`)
- Renderer process (`renderer.tsx`) fetches current constant values on mount and optimistically updates the UI on toggle, reverting on error
