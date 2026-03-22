/**
 * renderer.tsx -- Renderer Process Entry Point for the WordPress Supercharged Addon
 *
 * This is a thin wiring shell. It extracts React and hooks from Local's addon
 * context and delegates to feature-specific hook registration functions.
 *
 * To add a new feature, import its registration function and call it here.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { FEATURE_FLAGS } from './shared/types';
import { registerDebugConstantsHooks } from './features/debug-constants/debug-constants.hooks';
import { registerNgrokHooks } from './features/ngrok/ngrok.hooks';
import { registerProfilerSetupHooks } from './features/profiler-setup/profiler-setup.hooks';
import { registerConflictTestHooks } from './features/conflict-test/conflict-test.hooks';

export default function (context: LocalRenderer.AddonRendererContext): void {
	const { React, hooks } = context;

	registerDebugConstantsHooks(React, hooks);
	registerNgrokHooks(React, hooks);
	if (FEATURE_FLAGS.PROFILER) {
		registerProfilerSetupHooks(React, hooks);
	}
	registerConflictTestHooks(React, hooks);
}
