/**
 * main.ts -- Main Process Entry Point for the WordPress Supercharged Addon
 *
 * This is a thin wiring shell. It extracts dependencies from Local's service
 * container and delegates to feature-specific registration functions.
 *
 * To add a new feature, import its registration function and call it here.
 */

import * as LocalMain from '@getflywheel/local/main';
import { registerDebugConstantsIpc } from './features/debug-constants/debug-constants.ipc';

export default function (context: LocalMain.AddonMainContext): void {
	const { wpCli, siteData, localLogger } = LocalMain.getServiceContainer().cradle;

	const logger = localLogger.child({
		thread: 'main',
		addon: 'wordpress-supercharged',
	});

	registerDebugConstantsIpc({ wpCli, siteData, logger });
}
