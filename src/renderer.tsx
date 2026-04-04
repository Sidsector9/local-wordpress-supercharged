/**
 * renderer.tsx -- Renderer Process Entry Point
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { FEATURE_FLAGS } from './shared/types';
import { registerDebugConstantsHooks } from './features/debug-constants/DebugSwitches';
import { registerNgrokHooks } from './features/ngrok/NgrokRow';
import { registerProfilerSetupHooks } from './features/profiler-setup/profiler-setup.hooks';
import { registerConflictTestHooks } from './features/conflict-test/ConflictTestPanel';
import { registerVulnScanHooks } from './features/vuln-scan/VulnScanPanel';

/**
 * Renderer process entry point. Registers UI hooks for all addon features
 * into Local's Site Overview and Tools tabs.
 *
 * @param context
 */
export default function( context: LocalRenderer.AddonRendererContext ): void {
	const { React, hooks } = context;

	registerDebugConstantsHooks( React, hooks );
	registerNgrokHooks( React, hooks );
	if ( FEATURE_FLAGS.PROFILER ) {
		registerProfilerSetupHooks( React, hooks );
	}
	registerConflictTestHooks( React, hooks );
	registerVulnScanHooks( React, hooks );
}
