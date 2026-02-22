import * as LocalMain from '@getflywheel/local/main';

const DEBUG_CONSTANTS = ['WP_DEBUG', 'WP_DEBUG_LOG', 'WP_DEBUG_DISPLAY'] as const;

export default function (context: LocalMain.AddonMainContext): void {
	const { wpCli, siteData, localLogger } = LocalMain.getServiceContainer().cradle;

	const logger = localLogger.child({
		thread: 'main',
		addon: 'wordpress-supercharged',
	});

	LocalMain.addIpcAsyncListener(
		'supercharged:get-debug-constants',
		async (siteId: string) => {
			const site = siteData.getSite(siteId);
			const results: Record<string, boolean> = {};

			for (const constant of DEBUG_CONSTANTS) {
				try {
					const value = await wpCli.run(site, ['config', 'get', constant, `--path=${site.path}`], { ignoreErrors: true });
					results[constant] = value?.trim() === '1' || value?.trim().toLowerCase() === 'true';
				} catch (e) {
					results[constant] = false;
				}
			}

			logger.info(`Fetched debug constants for site ${siteId}: ${JSON.stringify(results)}`);
			return results;
		},
	);

	LocalMain.addIpcAsyncListener(
		'supercharged:set-debug-constant',
		async (siteId: string, constant: string, value: boolean) => {
			const site = siteData.getSite(siteId);
			const wpValue = value ? 'true' : 'false';

			await wpCli.run(site, ['config', 'set', constant, wpValue, '--raw', '--add', `--path=${site.path}`]);
			logger.info(`Set ${constant} to ${wpValue} for site ${siteId}`);

			return { success: true };
		},
	);
}
