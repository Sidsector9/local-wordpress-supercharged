# Changelog

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
