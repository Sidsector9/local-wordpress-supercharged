/**
 * shared/types.ts — Types, constants, and IPC channel names shared between
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
export const DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY'] as const;

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
 * The shape of the data persisted on the SiteJSON object under the
 * `superchargedAddon` key via `siteData.updateSite()`.
 *
 * @property debugConstants — The cached boolean values for each debug constant.
 * @property cachedAt       — Unix timestamp (ms) of when the cache was last written.
 *                            Compared against wp-config.php's mtime to detect
 *                            external modifications and invalidate stale caches.
 */
export interface SuperchargedCache {
	debugConstants: DebugConstantsMap;
	cachedAt: number;
}

/**
 * Default state: all constants off. Used as the initial renderer state
 * and as a fallback when fetching fails.
 */
export const DEFAULT_DEBUG_STATE: DebugConstantsMap = {
	WP_DEBUG: false,
	WP_DEBUG_LOG: false,
	WP_DEBUG_DISPLAY: false,
};

/**
 * IPC channel names, centralized to avoid typos and enable find-all-references.
 *
 * Channels prefixed with `supercharged:` to namespace them and avoid
 * collisions with other addons.
 */
export const IPC_CHANNELS = {
	GET_DEBUG_CONSTANTS: 'supercharged:get-debug-constants',
	SET_DEBUG_CONSTANT: 'supercharged:set-debug-constant',
	WATCH_SITE: 'supercharged:watch-site',
	UNWATCH_SITE: 'supercharged:unwatch-site',
	DEBUG_CONSTANTS_CHANGED: 'supercharged:debug-constants-changed',
} as const;
