/**
 * ngrok.hooks.tsx -- Renderer-process hook registrations for the ngrok feature.
 *
 * Registers the NgrokRow component on the SiteInfoOverview_TableList
 * content hook so the ngrok controls appear in the site overview table.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { createNgrokRow } from './NgrokRow';

/**
 * Registers all renderer-side hooks for the ngrok feature.
 *
 * @param React -- The React instance from Local's addon context.
 * @param hooks -- The HooksRenderer class from Local's addon context.
 */
export function registerNgrokHooks(
	React: typeof import('react'),
	hooks: typeof LocalRenderer.HooksRenderer,
): void {
	const NgrokRow = createNgrokRow(React);

	hooks.addContent('SiteInfoOverview_TableList', (site) => (
		<NgrokRow key="wordpress-supercharged-ngrok" site={site} />
	));
}
