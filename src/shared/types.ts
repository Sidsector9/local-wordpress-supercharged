/**
 * shared/types.ts -- Types, constants, and IPC channel names shared between
 * the main and renderer processes.
 *
 * This module is the single source of truth for data shapes and identifiers
 * used across process boundaries. Both main.ts and renderer.tsx import from
 * here, eliminating duplication and ensuring IPC contracts stay in sync.
 */

/**
 * The three WordPress debug constants this addon manages.
 * Defined as a const tuple so it can be iterated and used as a type union.
 */
export const DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY', 'SCRIPT_DEBUG'] as const;

/**
 * Union type of the debug constant names.
 */
export type DebugConstantName = typeof DEBUG_CONSTANTS[number];

/**
 * A map of constant names to their boolean values.
 * Used as the return shape from fetching, the cache shape, and the renderer state.
 */
export type DebugConstantsMap = Record<DebugConstantName, boolean>;

/**
 * Current cache format version. Bumped when the shape or semantics of cached
 * data change in a way that makes old caches unreliable. Caches written with
 * an older (or missing) version are treated as stale and re-fetched.
 */
export const CACHE_VERSION = 4;

/**
 * The shape of the data persisted on the SiteJSON object under the
 * `superchargedAddon` key via `siteData.updateSite()`.
 *
 * @property debugConstants -- The cached boolean values for each debug constant.
 * @property cachedAt       -- Unix timestamp (ms) of when the cache was last written.
 *                            Compared against wp-config.php's mtime to detect
 *                            external modifications and invalidate stale caches.
 * @property cacheVersion   -- Format version. Caches missing this field or with
 *                            an older version are invalidated on read.
 */
export interface SuperchargedCache {
	debugConstants: DebugConstantsMap;
	cachedAt: number;
	cacheVersion?: number;
	ngrok?: NgrokCache;
	profiler?: ProfilerCache;
}

/**
 * Persisted ngrok state for a site, stored under `superchargedAddon.ngrok`.
 */
export interface NgrokCache {
	enabled: boolean;
	url: string;
}

/**
 * Persisted profiler setup state for a site, stored under
 * `superchargedAddon.profiler`.
 */
export interface ProfilerCache {
	setupCompleted: boolean;
	phpVersion?: string;
}

/**
 * Status of an individual profiler tool.
 * 'ready' = installed and verified, 'missing' = not installed,
 * 'error' = install attempted but failed.
 */
export type ToolStatus = 'ready' | 'missing' | 'error';

/**
 * Per-tool installation result with optional version and error info.
 */
export interface ToolCheckResult {
	status: ToolStatus;
	version?: string;
	error?: string;
}

/**
 * Aggregate profiler setup status returned by GET_PROFILER_STATUS.
 */
export interface ProfilerSetupStatus {
	xhprof: ToolCheckResult;
	k6: ToolCheckResult;
	muPlugin: ToolCheckResult;
}

/**
 * WordPress core runtime defaults for each debug constant.
 * Used by fetchDebugConstants as the fallback when a constant
 * is not explicitly defined in wp-config.php.
 *
 * Per wp-settings.php:
 *   - WP_DEBUG defaults to false
 *   - WP_DEBUG_LOG defaults to false
 *   - WP_DEBUG_DISPLAY defaults to true
 */
export const WP_DEFAULTS: DebugConstantsMap = {
	WP_DEBUG: false,
	WP_DEBUG_LOG: false,
	WP_DEBUG_DISPLAY: true,
	SCRIPT_DEBUG: false,
};

/**
 * Default state: used as the initial renderer state and as a
 * fallback when fetching fails. Matches WP core defaults.
 */
export const DEFAULT_DEBUG_STATE: DebugConstantsMap = { ...WP_DEFAULTS };

/**
 * Feature flags. Set to true to enable a feature, false to hide it.
 * No code is removed -- the feature is just not registered.
 */
export const FEATURE_FLAGS = {
	PROFILER: false,
} as const;

/**
 * IPC channel names, centralized to avoid typos and enable find-all-references.
 *
 * Channels prefixed with `supercharged:` to namespace them and avoid
 * collisions with other addons.
 */
export const NGROK_CONSTANTS = ['WP_HOME', 'WP_SITEURL'] as const;

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

/**
 * A WordPress plugin as returned by WP-CLI.
 */
export interface PluginInfo {
	name: string;
	status: 'active' | 'inactive';
	version: string;
	file: string;
}

/**
 * Override config stored at wp-content/conflict-test-overrides.json.
 * Keys are plugin basenames, values are the desired active state.
 */
export interface ConflictOverrides {
	overrides: Record<string, boolean>;
}

/**
 * Plugin dependency map. Key is plugin file (e.g. "google-listings-and-ads/google-listings-and-ads.php"),
 * value is comma-separated slug list of required plugins (e.g. "woocommerce").
 */
export type PluginDependencyMap = Record<string, string>;
