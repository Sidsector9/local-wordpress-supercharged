# Local WordPress Supercharged

A [Local by Flywheel](https://localwp.com/) addon that supercharges your local WordPress development workflow -- toggle debug constants, start ngrok tunnels, and more, all from the Site Overview page.

## Features

### One-Click ngrok Tunnels

Expose your local WordPress site to the internet in one click. Paste your ngrok URL, hit Start, and you're live.

![ngrok tunnel demo](gifs/ngrok.gif)

- **One button** -- Start enables `WP_HOME`/`WP_SITEURL` and launches the tunnel. Stop reverses everything.
- **Live status indicator** -- see at a glance if your tunnel is active
- **Collision detection** -- handles multiple sites sharing the same ngrok URL gracefully
- **Auto-cleanup** -- tunnels are killed automatically when a site is stopped
- **Inline error reporting** -- ngrok errors surface directly in the UI

### Toggle Debug Constants

Toggle `WP_DEBUG`, `WP_DEBUG_LOG`, and `WP_DEBUG_DISPLAY` from the Site Overview page. No more editing `wp-config.php` by hand.

![debug constants demo](gifs/debug-constants.gif)

- **Instant switching** -- cached values mean zero delay when switching between sites
- **Live sync** -- edit `wp-config.php` externally and the UI updates in real time
- **Optimistic UI** -- switches update immediately, roll back on failure

## Installation

Clone into the Local addons directory:

- **macOS**: `~/Library/Application Support/Local/addons`
- **Windows**: `C:\Users\username\AppData\Roaming\Local\addons`
- **Linux**: `~/.config/Local/addons`

Then:

```bash
yarn install
yarn build
```

Open Local and enable the addon.

## Development

```bash
yarn build        # Compile TypeScript
yarn watch        # Compile in watch mode
yarn test         # Run tests
```

### Project Structure

```
src/
  main.ts              # Main process entry point
  renderer.tsx          # Renderer process entry point
  shared/types.ts       # Shared types, constants, IPC channels
  features/
    debug-constants/    # WP_DEBUG toggle feature
    ngrok/              # ngrok tunnel feature
```

Each feature is self-contained under `src/features/`.

## License

MIT
