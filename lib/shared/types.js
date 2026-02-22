"use strict";
/**
 * shared/types.ts — Types, constants, and IPC channel names shared between
 * the main and renderer processes.
 *
 * This module is the single source of truth for data shapes and identifiers
 * used across process boundaries. Both main.ts and renderer.tsx import from
 * here, eliminating duplication and ensuring IPC contracts stay in sync.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = exports.DEFAULT_DEBUG_STATE = exports.DEBUG_CONSTANTS = void 0;
/**
 * The three WordPress debug constants this addon manages.
 * Defined as a const tuple so it can be iterated and used as a type union.
 */
exports.DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY'];
/**
 * Default state: all constants off. Used as the initial renderer state
 * and as a fallback when fetching fails.
 */
exports.DEFAULT_DEBUG_STATE = {
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
exports.IPC_CHANNELS = {
    GET_DEBUG_CONSTANTS: 'supercharged:get-debug-constants',
    SET_DEBUG_CONSTANT: 'supercharged:set-debug-constant',
    WATCH_SITE: 'supercharged:watch-site',
    UNWATCH_SITE: 'supercharged:unwatch-site',
    DEBUG_CONSTANTS_CHANGED: 'supercharged:debug-constants-changed',
};
//# sourceMappingURL=types.js.map