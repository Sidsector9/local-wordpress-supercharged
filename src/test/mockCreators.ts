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
	conf: string;
	confTemplates: string;
	superchargedAddon: any;
}> = {}): Local.Site {
	const id = overrides.id ?? 'test-site-id';
	const sitePath = overrides.path ?? '/Users/Local Sites/test-site';
	const webRoot = overrides.webRoot ?? `${sitePath}/app/public`;
	const conf = overrides.conf ?? `${sitePath}/conf`;
	const confTemplates = overrides.confTemplates ?? conf;

	const site: any = {
		id,
		path: sitePath,
		paths: {
			webRoot,
			conf,
			confTemplates,
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
		getSites: jest.fn(() => ({})),
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

/**
 * Creates a mock LightningService with PHP binary paths and environment.
 */
export function createMockLightningService(overrides: Partial<{
	bin: Record<string, string>;
	$PATH: string;
	binVersion: string;
	env: NodeJS.ProcessEnv;
}> = {}) {
	return {
		bin: overrides.bin ?? {
			php: '/opt/local/lightning-services/php-8.2.0/bin/php',
			phpize: '/opt/local/lightning-services/php-8.2.0/bin/phpize',
			'php-config': '/opt/local/lightning-services/php-8.2.0/bin/php-config',
		},
		$PATH: overrides.$PATH ?? '/opt/local/lightning-services/php-8.2.0/bin',
		binVersion: overrides.binVersion ?? '8.2.0',
		env: overrides.env ?? {
			PATH: '/opt/local/lightning-services/php-8.2.0/bin',
		},
	};
}

/**
 * Creates a mock LightningServices service with jest.fn() methods.
 */
export function createMockLightningServices(defaultService?: ReturnType<typeof createMockLightningService>) {
	return {
		getSiteServiceByRole: jest.fn(() => defaultService ?? createMockLightningService()),
	};
}

/**
 * Creates a mock SiteProcessManager with jest.fn() methods.
 */
export function createMockSiteProcessManager() {
	return {
		restart: jest.fn().mockResolvedValue(undefined),
		restartSiteService: jest.fn().mockResolvedValue(undefined),
	};
}
