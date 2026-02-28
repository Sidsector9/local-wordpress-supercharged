/**
 * debug-constants.hooks.ts -- Renderer-process hook registrations for the
 * debug constants feature.
 *
 * Registers the DebugSwitches component on the SiteInfoOverview_TableList
 * content hook so the switches appear in the site overview table.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { createDebugSwitches } from './DebugSwitches';

/**
 * Registers all renderer-side hooks for the debug constants feature.
 *
 * @param React -- The React instance from Local's addon context.
 * @param hooks -- The HooksRenderer class from Local's addon context.
 */
export function registerDebugConstantsHooks(
	React: typeof import('react'),
	hooks: typeof LocalRenderer.HooksRenderer,
): void {
	const DebugSwitches = createDebugSwitches(React);

	hooks.addContent('SiteInfoOverview_TableList', (site) => (
		<DebugSwitches key="wordpress-supercharged-debug" site={site} />
	));
}
