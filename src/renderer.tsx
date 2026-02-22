/**
 * renderer.tsx — Renderer Process Entry Point for the WordPress Supercharged Addon
 *
 * This is a thin wiring shell. It extracts React and hooks from Local's addon
 * context and delegates to feature-specific hook registration functions.
 *
 * To add a new feature, import its registration function and call it here.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { registerDebugConstantsHooks } from './features/debug-constants/debug-constants.hooks';

export default function (context: LocalRenderer.AddonRendererContext): void {
	const { React, hooks } = context;

	registerDebugConstantsHooks(React, hooks);
}
