/**
 * Mock module for @getflywheel/local.
 *
 * Jest's moduleNameMapper redirects all imports of '@getflywheel/local'
 * to this file. Provides the runtime values (enums, etc.) that the
 * addon's source code imports from the core types module.
 */

export enum SiteServiceRole {
	HTTP = 'http',
	DATABASE = 'db',
	PHP = 'php',
	FRONTEND = 'frontend',
	OTHER = 'other',
}

export enum SiteServiceType {
	LIGHTNING = 'lightning',
}

export enum MultiSite {
	No = '',
	Subdir = 'ms-subdir',
	Subdomain = 'ms-subdomain',
}
