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
exports.IPC_CHANNELS = exports.NGROK_CONSTANTS = exports.FEATURE_FLAGS = exports.DEFAULT_DEBUG_STATE = exports.WP_DEFAULTS = exports.CACHE_VERSION = exports.DEBUG_CONSTANTS = void 0;
/**
 * The three WordPress debug constants this addon manages.
 * Defined as a const tuple so it can be iterated and used as a type union.
 */
exports.DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY', 'SCRIPT_DEBUG'];
/**
 * Current cache format version. Bumped when the shape or semantics of cached
 * data change in a way that makes old caches unreliable. Caches written with
 * an older (or missing) version are treated as stale and re-fetched.
 */
exports.CACHE_VERSION = 4;
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
    SCRIPT_DEBUG: false,
};
/**
 * Default state: used as the initial renderer state and as a
 * fallback when fetching fails. Matches WP core defaults.
 */
exports.DEFAULT_DEBUG_STATE = Object.assign({}, exports.WP_DEFAULTS);
/**
 * Feature flags. Set to true to enable a feature, false to hide it.
 * No code is removed -- the feature is just not registered.
 */
exports.FEATURE_FLAGS = {
    PROFILER: false,
};
/**
 * IPC channel names, centralized to avoid typos and enable find-all-references.
 *
 * Channels prefixed with `supercharged:` to namespace them and avoid
 * collisions with other addons.
 */
exports.NGROK_CONSTANTS = ['WP_HOME', 'WP_SITEURL'];
exports.IPC_CHANNELS = {
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
};
//# sourceMappingURL=types.js.map