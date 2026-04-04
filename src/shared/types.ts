/**
 * shared/types.ts -- Types, constants, and IPC channel names shared between
 * the main and renderer processes.
 */

export const DEBUG_CONSTANTS = [ 'WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY', 'SCRIPT_DEBUG' ] as const;
export type DebugConstantName = typeof DEBUG_CONSTANTS[number];
export type DebugConstantsMap = Record<DebugConstantName, boolean>;

/** Bumped when cache shape changes to invalidate old caches. */
export const CACHE_VERSION = 4;

export interface SuperchargedCache {
	debugConstants: DebugConstantsMap;
	cachedAt: number;
	cacheVersion?: number;
	ngrok?: NgrokCache;
	profiler?: ProfilerCache;
}

export interface NgrokCache {
	enabled: boolean;
	url: string;
}

export interface ProfilerCache {
	setupCompleted: boolean;
	phpVersion?: string;
}

export type ToolStatus = 'ready' | 'missing' | 'error';

export interface ToolCheckResult {
	status: ToolStatus;
	version?: string;
	error?: string;
}

export interface ProfilerSetupStatus {
	xhprof: ToolCheckResult;
	k6: ToolCheckResult;
	muPlugin: ToolCheckResult;
}

/**
 * WordPress core runtime defaults for each debug constant.
 * WP_DEBUG_DISPLAY defaults to true in wp-settings.php; the rest default to false.
 */
export const WP_DEFAULTS: DebugConstantsMap = {
	WP_DEBUG: false,
	WP_DEBUG_LOG: false,
	WP_DEBUG_DISPLAY: true,
	SCRIPT_DEBUG: false,
};

export const DEFAULT_DEBUG_STATE: DebugConstantsMap = { ...WP_DEFAULTS };

/** Feature flags. Set to true to enable, false to hide (code stays in place). */
export const FEATURE_FLAGS = {
	PROFILER: false,
} as const;

export const NGROK_CONSTANTS = [ 'WP_HOME', 'WP_SITEURL' ] as const;

export const IPC_CHANNELS = {
	GET_DEBUG_CONSTANTS: 'supercharged:get-debug-constants',
	SET_DEBUG_CONSTANT: 'supercharged:set-debug-constant',
	WATCH_SITE: 'supercharged:watch-site',
	UNWATCH_SITE: 'supercharged:unwatch-site',
	DEBUG_CONSTANTS_CHANGED: 'supercharged:debug-constants-changed',
	GET_NGROK: 'supercharged:get-ngrok',
	APPLY_NGROK: 'supercharged:apply-ngrok',
	ENABLE_NGROK: 'supercharged:enable-ngrok',
	CLEAR_NGROK: 'supercharged:clear-ngrok',
	NGROK_CHANGED: 'supercharged:ngrok-changed',
	START_NGROK_PROCESS: 'supercharged:start-ngrok-process',
	STOP_NGROK_PROCESS: 'supercharged:stop-ngrok-process',
	GET_NGROK_PROCESS_STATUS: 'supercharged:get-ngrok-process-status',
	NGROK_PROCESS_STATUS_CHANGED: 'supercharged:ngrok-process-status-changed',
	GET_PROFILER_STATUS: 'supercharged:get-profiler-status',
	RUN_PROFILER_SETUP: 'supercharged:run-profiler-setup',
	PROFILER_SETUP_LOG: 'supercharged:profiler-setup-log',
	PROFILER_SETUP_COMPLETED: 'supercharged:profiler-setup-completed',
	GET_PLUGIN_LIST: 'supercharged:get-plugin-list',
	GET_CONFLICT_OVERRIDES: 'supercharged:get-conflict-overrides',
	SET_CONFLICT_OVERRIDE: 'supercharged:set-conflict-override',
	CLEAR_CONFLICT_OVERRIDES: 'supercharged:clear-conflict-overrides',
} as const;

export interface PluginInfo {
	name: string;
	status: 'active' | 'inactive';
	version: string;
	file: string;
}

/** Keys are plugin basenames, values are the desired active state. */
export interface ConflictOverrides {
	overrides: Record<string, boolean>;
}

/** Key is plugin file, value is comma-separated slug list of required plugins. */
export type PluginDependencyMap = Record<string, string>;
