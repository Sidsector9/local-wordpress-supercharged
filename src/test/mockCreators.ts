/**
 * Factory functions for creating mock objects used across test suites.
 *
 * Each factory returns a fresh mock on every call, preventing state leakage
 * between tests.
 */

import * as Local from '@getflywheel/local';

/**
 * Creates a mock Local.Site object with sensible defaults.
 */
export function createMockSite(overrides: Partial<{
	id: string;
	path: string;
	webRoot: string;
	superchargedAddon: any;
}> = {}): Local.Site {
	const id = overrides.id ?? 'test-site-id';
	const sitePath = overrides.path ?? '/Users/Local Sites/test-site';
	const webRoot = overrides.webRoot ?? `${sitePath}/app/public`;

	const site: any = {
		id,
		path: sitePath,
		paths: {
			webRoot,
		},
	};

	if (overrides.superchargedAddon !== undefined) {
		site.superchargedAddon = overrides.superchargedAddon;
	}

	return site as Local.Site;
}

/**
 * Creates a mock WpCli service with a jest.fn() run method.
 */
export function createMockWpCli() {
	return {
		run: jest.fn(),
	};
}

/**
 * Creates a mock SiteDataService with jest.fn() methods.
 */
export function createMockSiteData(defaultSite?: Local.Site) {
	return {
		getSite: jest.fn((siteId: string) => defaultSite ?? createMockSite({ id: siteId })),
		updateSite: jest.fn(),
	};
}

/**
 * Creates a mock logger with jest.fn() info and warn methods.
 */
export function createMockLogger() {
	return {
		info: jest.fn(),
		warn: jest.fn(),
	};
}
