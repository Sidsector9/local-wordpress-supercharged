# Local Boilerplate Add-on

https://build.localwp.com/

## Get Started with the Local Add-on Generator

Get up and running with your new add-on quickly and easily with the [Local Add-on Generator](https://github.com/getflywheel/create-local-addon). It is super simple to set up, and can help you start developing your new add-on in no time!

The generator uses this boilerplate add-on to get you started, making setup easy and fast. The README for the generator also has more information on how to create an amazing add-on for Local, so be sure to check it out!

## Installation

### Clone

Clone the repository into the following directory depending on your platform:

-   macOS: `~/Library/Application Support/Local/addons`
-   Windows: `C:\Users\username\AppData\Roaming\Local\addons`
-   Debian Linux: `~/.config/Local/addons`

*You can replace 'Local' with 'Local Beta' if you want to create the add-on for Local Beta.*

### Install Add-on Dependencies

`yarn install`

### Add Add-on to Local

1. Clone repo directly into the add-ons folder (paths described above)
2. `yarn install` (install dependencies)
2. `yarn build`
3. Open Local and enable add-on

## Development

### External Libraries

- @getflywheel/local provides type definitions for Local's Add-on API.
	- Node Module: https://www.npmjs.com/package/@getflywheel/local-components
	- GitHub Repo: https://github.com/getflywheel/local-components

- @getflywheel/local-components provides reusable React components to use in your Local add-on.
	- Node Module: https://www.npmjs.com/package/@getflywheel/local
	- GitHub Repo: https://github.com/getflywheel/local-addon-api
	- Style Guide: https://getflywheel.github.io/local-components

### Folder Structure

All files in `/src` will be transpiled to `/lib` using [TypeScript](https://www.typescriptlang.org/). Anything in `/lib` will be overwritten.

### Development Workflow

If you are looking for help getting started, you can consult [the documentation for the add-on generator](https://github.com/getflywheel/create-local-addon#next-steps).

You can consult the [Local add-on API](https://getflywheel.github.io/local-addon-api), which provides a wide range of values and functions for developing your add-on.

## License

MIT

## CLAUDE instructions

Read the ../../README.md and ../../CLAUDE.md file to revise your instructions on building the addon.

### Version 1

This addons implements the following:
- Uses the `Switch` component to implement 3 switches to toggle WP_DEBUG, WP_DEBUG_LOG and WP_DEBUG_DISPLAY.
- Each `Switch` is wrapped in a TableListRow.
- The switches are implemented on the `SiteInfoOverview_TableList` page.
- Toggling the switches should trigger the WP-CLI (WordPress CLI) command to get and set the constants. For example:
  - wp config get <constant> --path=<site_path>
  - wp config set <constant> <value> --raw --add --path=<site_path>
