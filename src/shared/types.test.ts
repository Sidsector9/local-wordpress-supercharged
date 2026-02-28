import 'jest-extended';

import {
	DEBUG_CONSTANTS,
	WP_DEFAULTS,
	DEFAULT_DEBUG_STATE,
	IPC_CHANNELS,
	CACHE_VERSION,
} from './types';

describe('DEBUG_CONSTANTS', () => {
	it('contains exactly 3 constant names', () => {
		expect(DEBUG_CONSTANTS).toHaveLength(3);
	});

	it('includes WP_DEBUG, WP_DEBUG_LOG, and WP_DEBUG_DISPLAY', () => {
		expect(DEBUG_CONSTANTS).toContain('WP_DEBUG');
		expect(DEBUG_CONSTANTS).toContain('WP_DEBUG_LOG');
		expect(DEBUG_CONSTANTS).toContain('WP_DEBUG_DISPLAY');
	});
});

describe('WP_DEFAULTS', () => {
	it('has WP_DEBUG defaulting to false', () => {
		expect(WP_DEFAULTS.WP_DEBUG).toBe(false);
	});

	it('has WP_DEBUG_LOG defaulting to false', () => {
		expect(WP_DEFAULTS.WP_DEBUG_LOG).toBe(false);
	});

	it('has WP_DEBUG_DISPLAY defaulting to true', () => {
		expect(WP_DEFAULTS.WP_DEBUG_DISPLAY).toBe(true);
	});
});

describe('DEFAULT_DEBUG_STATE', () => {
	it('matches WP_DEFAULTS values', () => {
		expect(DEFAULT_DEBUG_STATE).toEqual(WP_DEFAULTS);
	});

	it('is a separate object from WP_DEFAULTS', () => {
		expect(DEFAULT_DEBUG_STATE).not.toBe(WP_DEFAULTS);
	});
});

describe('IPC_CHANNELS', () => {
	it('has all expected channel keys', () => {
		expect(IPC_CHANNELS).toHaveProperty('GET_DEBUG_CONSTANTS');
		expect(IPC_CHANNELS).toHaveProperty('SET_DEBUG_CONSTANT');
		expect(IPC_CHANNELS).toHaveProperty('WATCH_SITE');
		expect(IPC_CHANNELS).toHaveProperty('UNWATCH_SITE');
		expect(IPC_CHANNELS).toHaveProperty('DEBUG_CONSTANTS_CHANGED');
	});

	it('prefixes all channels with "supercharged:"', () => {
		Object.values(IPC_CHANNELS).forEach((channel) => {
			expect(channel).toMatch(/^supercharged:/);
		});
	});
});

describe('CACHE_VERSION', () => {
	it('is a positive integer', () => {
		expect(Number.isInteger(CACHE_VERSION)).toBe(true);
		expect(CACHE_VERSION).toBeGreaterThan(0);
	});
});
