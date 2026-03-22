/**
 * profiler-setup.hooks.tsx -- Renderer-process hook registrations for the
 * profiler setup feature.
 *
 * Registers the ProfilerSetupPanel component on the siteInfoUtilities
 * content hook so the setup panel appears in the Tools tab.
 *
 * Note: The tab is labeled "Tools" in the UI but the hook name is
 * siteInfoUtilities (confirmed by testing). The TableListRow must be
 * returned directly from the addContent callback (not from a child
 * component) to match the pattern used by working addons.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { TableListRow } from '@getflywheel/local-components';
import { createProfilerSetupPanel } from './ProfilerSetupPanel';

/**
 * Registers all renderer-side hooks for the profiler setup feature.
 *
 * @param React -- The React instance from Local's addon context.
 * @param hooks -- The HooksRenderer class from Local's addon context.
 */
export function registerProfilerSetupHooks(
	React: typeof import('react'),
	hooks: typeof LocalRenderer.HooksRenderer,
): void {
	const ProfilerSetupPanel = createProfilerSetupPanel(React);

	hooks.addContent('siteInfoUtilities', (site) => (
		<TableListRow key="wordpress-supercharged-profiler" label="Profiler">
			<ProfilerSetupPanel site={site} />
		</TableListRow>
	));
}
