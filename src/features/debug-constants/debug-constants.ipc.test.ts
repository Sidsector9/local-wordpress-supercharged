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
	let deps: IpcDeps;
	let registeredHandlers: Record<string, Function>;

	beforeEach(() => {
		jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
		jest.clearAllMocks();

		wpCli = createMockWpCli();
		siteData = createMockSiteData();
		logger = createMockLogger();
		deps = { wpCli: wpCli as any, siteData: siteData as any, logger };

		// Capture handlers registered via addIpcAsyncListener
		registeredHandlers = {};
		(LocalMain.addIpcAsyncListener as jest.Mock).mockImplementation(
			(channel: string, handler: Function) => {
				registeredHandlers[channel] = handler;
			},
		);

		// Mock fs.watch to prevent actual file watching
		fs.watch.mockReturnValue({ close: jest.fn() });

		registerDebugConstantsIpc(deps);
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});

	it('registers 4 IPC listeners', () => {
		expect(LocalMain.addIpcAsyncListener).toHaveBeenCalledTimes(4);
	});

	it('registers handlers for all expected channels', () => {
		expect(registeredHandlers).toHaveProperty(IPC_CHANNELS.WATCH_SITE);
		expect(registeredHandlers).toHaveProperty(IPC_CHANNELS.UNWATCH_SITE);
		expect(registeredHandlers).toHaveProperty(IPC_CHANNELS.GET_DEBUG_CONSTANTS);
		expect(registeredHandlers).toHaveProperty(IPC_CHANNELS.SET_DEBUG_CONSTANT);
	});

	describe('GET handler', () => {
		it('returns cached constants when cache is fresh and version matches', async () => {
			const cachedConstants = { WP_DEBUG: true, WP_DEBUG_LOG: true, WP_DEBUG_DISPLAY: false };
			const cachedSite = createMockSite({
				id: 'site-1',
				superchargedAddon: {
					debugConstants: cachedConstants,
					cachedAt: Date.now() + 1000,
					cacheVersion: CACHE_VERSION,
				},
			});
			siteData.getSite.mockReturnValue(cachedSite);

			// Make mtime older than cachedAt
			fs.statSync.mockReturnValue({ mtimeMs: Date.now() - 10000 });

			const handler = registeredHandlers[IPC_CHANNELS.GET_DEBUG_CONSTANTS];
			const result = await handler('site-1');

			expect(result).toEqual(cachedConstants);
			expect(wpCli.run).not.toHaveBeenCalled();
		});

		it('fetches via WP-CLI when no cache exists', async () => {
			const site = createMockSite({ id: 'site-1' });
			siteData.getSite.mockReturnValue(site);
			wpCli.run.mockResolvedValue('1');

			const handler = registeredHandlers[IPC_CHANNELS.GET_DEBUG_CONSTANTS];
			const result = await handler('site-1');

			expect(wpCli.run).toHaveBeenCalledTimes(4);
			expect(result).toEqual({
				WP_DEBUG: true,
				WP_DEBUG_LOG: true,
				WP_DEBUG_DISPLAY: true,
				SCRIPT_DEBUG: true,
			});
		});

		it('fetches via WP-CLI when cache version mismatches', async () => {
			const cachedSite = createMockSite({
				id: 'site-1',
				superchargedAddon: {
					debugConstants: { WP_DEBUG: false, WP_DEBUG_LOG: false, WP_DEBUG_DISPLAY: true },
					cachedAt: Date.now() + 1000,
					cacheVersion: CACHE_VERSION - 1,
				},
			});
			siteData.getSite.mockReturnValue(cachedSite);
			wpCli.run.mockResolvedValue('1');

			const handler = registeredHandlers[IPC_CHANNELS.GET_DEBUG_CONSTANTS];
			await handler('site-1');

			expect(wpCli.run).toHaveBeenCalledTimes(4);
		});

		it('writes to cache after fetching', async () => {
			const site = createMockSite({ id: 'site-1' });
			siteData.getSite.mockReturnValue(site);
			wpCli.run.mockResolvedValue('1');

			const handler = registeredHandlers[IPC_CHANNELS.GET_DEBUG_CONSTANTS];
			await handler('site-1');

			expect(siteData.updateSite).toHaveBeenCalledTimes(1);
		});
	});

	describe('SET handler', () => {
		beforeEach(() => {
			const site = createMockSite({ id: 'site-1' });
			siteData.getSite.mockReturnValue(site);
		});

		it('calls wpCli.run with config set for a normal constant', async () => {
			wpCli.run.mockResolvedValue('1');

			const handler = registeredHandlers[IPC_CHANNELS.SET_DEBUG_CONSTANT];
			await handler('site-1', 'WP_DEBUG', true);

			// 1 call for set + 4 calls for re-fetch
			expect(wpCli.run).toHaveBeenCalledTimes(5);

			const firstCallArgs = wpCli.run.mock.calls[0][1];
			expect(firstCallArgs).toContain('set');
			expect(firstCallArgs).toContain('WP_DEBUG');
		});

		it('deletes WP_DEBUG_DISPLAY when setting to true and it is defined', async () => {
			// isConstantDefined succeeds -> defined = true
			// deleteConstant succeeds
			// then fetchDebugConstants (4 calls)
			wpCli.run.mockResolvedValue('something');

			const handler = registeredHandlers[IPC_CHANNELS.SET_DEBUG_CONSTANT];
			await handler('site-1', 'WP_DEBUG_DISPLAY', true);

			// Call 0: isConstantDefined (config get)
			// Call 1: deleteConstant (config delete)
			// Calls 2-5: fetchDebugConstants (4x config get)
			const deleteCallArgs = wpCli.run.mock.calls[1][1];
			expect(deleteCallArgs).toContain('delete');
			expect(deleteCallArgs).toContain('WP_DEBUG_DISPLAY');
		});

		it('skips delete when setting WP_DEBUG_DISPLAY to true but not defined', async () => {
			// isConstantDefined throws -> defined = false
			wpCli.run.mockRejectedValueOnce(new Error('not defined'));
			// fetchDebugConstants calls
			wpCli.run.mockResolvedValue('1');

			const handler = registeredHandlers[IPC_CHANNELS.SET_DEBUG_CONSTANT];
			await handler('site-1', 'WP_DEBUG_DISPLAY', true);

			// No delete call should exist
			const allArgs = wpCli.run.mock.calls.map((c: any[]) => c[1]);
			const deleteCalls = allArgs.filter((args: string[]) => args.includes('delete'));
			expect(deleteCalls).toHaveLength(0);
		});

		it('sets WP_DEBUG_DISPLAY to false normally (not delete)', async () => {
			wpCli.run.mockResolvedValue('');

			const handler = registeredHandlers[IPC_CHANNELS.SET_DEBUG_CONSTANT];
			await handler('site-1', 'WP_DEBUG_DISPLAY', false);

			const firstCallArgs = wpCli.run.mock.calls[0][1];
			expect(firstCallArgs).toContain('set');
			expect(firstCallArgs).toContain('WP_DEBUG_DISPLAY');
			expect(firstCallArgs).toContain('false');
		});

		it('returns success with constants after setting', async () => {
			wpCli.run.mockResolvedValue('1');

			const handler = registeredHandlers[IPC_CHANNELS.SET_DEBUG_CONSTANT];
			const result = await handler('site-1', 'WP_DEBUG', true);

			expect(result).toHaveProperty('success', true);
			expect(result).toHaveProperty('constants');
			expect(result.constants).toHaveProperty('WP_DEBUG');
		});
	});
});
