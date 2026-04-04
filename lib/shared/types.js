"use strict";
/**
 * shared/types.ts -- Types, constants, and IPC channel names shared between
 * the main and renderer processes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = exports.NGROK_CONSTANTS = exports.FEATURE_FLAGS = exports.DEFAULT_DEBUG_STATE = exports.WP_DEFAULTS = exports.CACHE_VERSION = exports.DEBUG_CONSTANTS = void 0;
exports.DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY', 'SCRIPT_DEBUG'];
/** Bumped when cache shape changes to invalidate old caches. */
exports.CACHE_VERSION = 4;
/**
 * WordPress core runtime defaults for each debug constant.
 * WP_DEBUG_DISPLAY defaults to true in wp-settings.php; the rest default to false.
 */
exports.WP_DEFAULTS = {
    WP_DEBUG: false,
    WP_DEBUG_LOG: false,
    WP_DEBUG_DISPLAY: true,
    SCRIPT_DEBUG: false,
};
exports.DEFAULT_DEBUG_STATE = Object.assign({}, exports.WP_DEFAULTS);
/** Feature flags. Set to true to enable, false to hide (code stays in place). */
exports.FEATURE_FLAGS = {
    PROFILER: false,
};
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