/**
 * renderer.tsx -- Renderer Process Entry Point
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { FEATURE_FLAGS } from './shared/types';
import { registerDebugConstantsHooks } from './features/debug-constants/DebugSwitches';
import { registerNgrokHooks } from './features/ngrok/NgrokRow';
import { registerProfilerSetupHooks } from './features/profiler-setup/profiler-setup.hooks';
import { registerConflictTestHooks } from './features/conflict-test/ConflictTestPanel';

export default function( context: LocalRenderer.AddonRendererContext ): void {
	const { React, hooks } = context;

	registerDebugConstantsHooks( React, hooks );
	registerNgrokHooks( React, hooks );
	if ( FEATURE_FLAGS.PROFILER ) {
		registerProfilerSetupHooks( React, hooks );
	}
	registerConflictTestHooks( React, hooks );
}
