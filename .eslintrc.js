module.exports = {
	extends: ['plugin:@wordpress/eslint-plugin/recommended'],
	root: true,
	rules: {
		'import/no-unresolved': [
			2,
			{
				ignore: [
					/**
					 * Ignore @getflywheel/local and electron import paths since these
					 * modules are injected at runtime by the Local Electron host.
					 */
					'@getflywheel/local',
					'electron',
				],
			},
		],
		/**
		 * electron is provided by the Local Electron host at runtime
		 * and should not be listed as a project dependency.
		 */
		'import/no-extraneous-dependencies': 'off',
	},
	settings: {
		'import/resolver': {
			node: {
				extensions: ['.ts', '.tsx', '.js', '.jsx'],
			},
		},
	},
};
