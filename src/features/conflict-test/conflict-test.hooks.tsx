/**
 * conflict-test.hooks.tsx -- Renderer-process hook registrations for the
 * conflict testing feature.
 *
 * Registers the ConflictTestPanel component on the siteInfoUtilities
 * content hook so it appears in the Tools tab.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { TableListRow } from '@getflywheel/local-components';
import { createConflictTestPanel } from './ConflictTestPanel';

/**
 * Registers all renderer-side hooks for the conflict testing feature.
 */
export function registerConflictTestHooks(
	React: typeof import('react'),
	hooks: typeof LocalRenderer.HooksRenderer,
): void {
	const ConflictTestPanel = createConflictTestPanel(React);

	hooks.addContent('siteInfoUtilities', (site) => (
		<TableListRow key="wordpress-supercharged-conflict-test" label="Conflict Testing">
			<ConflictTestPanel site={site} />
		</TableListRow>
	));
}
