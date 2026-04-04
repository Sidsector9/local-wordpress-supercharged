import 'jest-extended';

import * as LocalMain from '@getflywheel/local/main';
import { registerDebugConstantsIpc, IpcDeps } from './debug-constants.ipc';
import { IPC_CHANNELS, CACHE_VERSION } from '../../shared/types';
import { createMockSite, createMockWpCli, createMockSiteData, createMockLogger } from '../../test/mockCreators';

jest.mock('fs');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

describe('registerDebugConstantsIpc', () => {
	let wpCli: ReturnType<typeof createMockWpCli>;
	let siteData: ReturnType<typeof createMockSiteData>;
	let logger: ReturnType<typeof createMockLogger>;
	let handlers: Record<string, Function>;

	beforeEach(() => {
		jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
		jest.clearAllMocks();

		wpCli = createMockWpCli();
		siteData = createMockSiteData();
		logger = createMockLogger();

		handlers = {};
		(LocalMain.addIpcAsyncListener as jest.Mock).mockImplementation(
			(channel: string, handler: Function) => { handlers[channel] = handler; },
		);

		fs.watch.mockReturnValue({ close: jest.fn() });

		registerDebugConstantsIpc({ wpCli: wpCli as any, siteData: siteData as any, logger });
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});

	describe('GET handler', () => {
		it('returns cached constants when fresh', async () => {
			const cachedConstants = { WP_DEBUG: true, WP_DEBUG_LOG: true, WP_DEBUG_DISPLAY: false };
			siteData.getSite.mockReturnValue(createMockSite({
				id: 'site-1',
				superchargedAddon: {
					debugConstants: cachedConstants,
					cachedAt: Date.now() + 1000,
					cacheVersion: CACHE_VERSION,
				},
			}));
			fs.statSync.mockReturnValue({ mtimeMs: Date.now() - 10000 });

			const result = await handlers[IPC_CHANNELS.GET_DEBUG_CONSTANTS]('site-1');
			expect(result).toEqual(cachedConstants);
			expect(wpCli.run).not.toHaveBeenCalled();
		});

		it('fetches via WP-CLI when no cache', async () => {
			siteData.getSite.mockReturnValue(createMockSite({ id: 'site-1' }));
			wpCli.run.mockResolvedValue('1');

			const result = await handlers[IPC_CHANNELS.GET_DEBUG_CONSTANTS]('site-1');
			expect(wpCli.run).toHaveBeenCalledTimes(4);
			expect(result).toEqual({
				WP_DEBUG: true,
				WP_DEBUG_LOG: true,
				WP_DEBUG_DISPLAY: true,
				SCRIPT_DEBUG: true,
			});
		});

		it('fetches via WP-CLI when cache version mismatches', async () => {
			siteData.getSite.mockReturnValue(createMockSite({
				id: 'site-1',
				superchargedAddon: {
					debugConstants: { WP_DEBUG: false, WP_DEBUG_LOG: false, WP_DEBUG_DISPLAY: true },
					cachedAt: Date.now() + 1000,
					cacheVersion: CACHE_VERSION - 1,
				},
			}));
			wpCli.run.mockResolvedValue('1');

			await handlers[IPC_CHANNELS.GET_DEBUG_CONSTANTS]('site-1');
			expect(wpCli.run).toHaveBeenCalledTimes(4);
		});

		it('writes fetched values to cache', async () => {
			siteData.getSite.mockReturnValue(createMockSite({ id: 'site-1' }));
			wpCli.run.mockResolvedValue('1');

			await handlers[IPC_CHANNELS.GET_DEBUG_CONSTANTS]('site-1');

			const written = siteData.updateSite.mock.calls[0][1].superchargedAddon;
			expect(written.debugConstants).toEqual({
				WP_DEBUG: true,
				WP_DEBUG_LOG: true,
				WP_DEBUG_DISPLAY: true,
				SCRIPT_DEBUG: true,
			});
			expect(written.cacheVersion).toBeDefined();
			expect(written.cachedAt).toBeGreaterThan(0);
		});
	});

	describe('SET handler', () => {
		beforeEach(() => {
			siteData.getSite.mockReturnValue(createMockSite({ id: 'site-1' }));
		});

		it('calls config set for a normal constant', async () => {
			wpCli.run.mockResolvedValue('1');

			await handlers[IPC_CHANNELS.SET_DEBUG_CONSTANT]('site-1', 'WP_DEBUG', true);

			// 1 set + 4 re-fetch
			expect(wpCli.run).toHaveBeenCalledTimes(5);
			expect(wpCli.run.mock.calls[0][1]).toContain('set');
			expect(wpCli.run.mock.calls[0][1]).toContain('WP_DEBUG');
		});

		it('deletes WP_DEBUG_DISPLAY when setting to true and it is defined', async () => {
			wpCli.run.mockResolvedValue('something');

			await handlers[IPC_CHANNELS.SET_DEBUG_CONSTANT]('site-1', 'WP_DEBUG_DISPLAY', true);

			// Call 0: isConstantDefined, Call 1: deleteConstant, Calls 2-5: re-fetch
			expect(wpCli.run.mock.calls[1][1]).toContain('delete');
			expect(wpCli.run.mock.calls[1][1]).toContain('WP_DEBUG_DISPLAY');
		});

		it('skips delete when WP_DEBUG_DISPLAY is not defined', async () => {
			wpCli.run.mockRejectedValueOnce(new Error('not defined'));
			wpCli.run.mockResolvedValue('1');

			await handlers[IPC_CHANNELS.SET_DEBUG_CONSTANT]('site-1', 'WP_DEBUG_DISPLAY', true);

			const allArgs = wpCli.run.mock.calls.map((c: any[]) => c[1]);
			expect(allArgs.filter((args: string[]) => args.includes('delete'))).toHaveLength(0);
		});

		it('sets WP_DEBUG_DISPLAY to false normally', async () => {
			wpCli.run.mockResolvedValue('');

			await handlers[IPC_CHANNELS.SET_DEBUG_CONSTANT]('site-1', 'WP_DEBUG_DISPLAY', false);
			expect(wpCli.run.mock.calls[0][1]).toContain('set');
			expect(wpCli.run.mock.calls[0][1]).toContain('false');
		});

	});
});
