"use strict";
/**
 * shared/types.ts -- Types, constants, and IPC channel names shared between
 * the main and renderer processes.
 *
 * This module is the single source of truth for data shapes and identifiers
 * used across process boundaries. Both main.ts and renderer.tsx import from
 * here, eliminating duplication and ensuring IPC contracts stay in sync.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = exports.DEFAULT_DEBUG_STATE = exports.WP_DEFAULTS = exports.CACHE_VERSION = exports.DEBUG_CONSTANTS = void 0;
/**
 * The three WordPress debug constants this addon manages.
 * Defined as a const tuple so it can be iterated and used as a type union.
 */
exports.DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY'];
/**
 * Current cache format version. Bumped when the shape or semantics of cached
 * data change in a way that makes old caches unreliable. Caches written with
 * an older (or missing) version are treated as stale and re-fetched.
 */
exports.CACHE_VERSION = 3;
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
exports.WP_DEFAULTS = {
    WP_DEBUG: false,
    WP_DEBUG_LOG: false,
    WP_DEBUG_DISPLAY: true,
};
/**
 * Default state: used as the initial renderer state and as a
 * fallback when fetching fails. Matches WP core defaults.
 */
exports.DEFAULT_DEBUG_STATE = Object.assign({}, exports.WP_DEFAULTS);
/**
 * IPC channel names, centralized to avoid typos and enable find-all-references.
 *
 * Channels prefixed with `supercharged:` to namespace them and avoid
 * collisions with other addons.
 */
exports.IPC_CHANNELS = {
    GET_DEBUG_CONSTANTS: 'supercharged:get-debug-constants',
    SET_DEBUG_CONSTANT: 'supercharged:set-debug-constant',
    WATCH_SITE: 'supercharged:watch-site',
    UNWATCH_SITE: 'supercharged:unwatch-site',
    DEBUG_CONSTANTS_CHANGED: 'supercharged:debug-constants-changed',
};
//# sourceMappingURL=types.js.map