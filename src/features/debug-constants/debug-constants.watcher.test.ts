import 'jest-extended';

import { createWatcherManager, WatcherDeps } from './debug-constants.watcher';
import { createMockSite, createMockWpCli, createMockSiteData, createMockLogger } from '../../test/mockCreators';
import * as LocalMain from '@getflywheel/local/main';

jest.mock('fs');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

describe('createWatcherManager', () => {
	let wpCli: ReturnType<typeof createMockWpCli>;
	let siteData: ReturnType<typeof createMockSiteData>;
	let logger: ReturnType<typeof createMockLogger>;
	let deps: WatcherDeps;
	let mockSite: ReturnType<typeof createMockSite>;
	let mockWatcherClose: jest.Mock;
	let watchCallback: (eventType: string, filename?: string) => void;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });

		mockSite = createMockSite();
		wpCli = createMockWpCli();
		siteData = createMockSiteData(mockSite);
		logger = createMockLogger();
		deps = { wpCli: wpCli as any, siteData: siteData as any, logger };

		mockWatcherClose = jest.fn();
		fs.watch.mockImplementation((_filePath: string, cb: Function) => {
			watchCallback = cb as any;
			return { close: mockWatcherClose };
		});
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});

	describe('watchSite', () => {
		it('creates an fs.watch on wp-config.php path', () => {
			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');

			expect(fs.watch).toHaveBeenCalledTimes(1);
			expect(fs.watch.mock.calls[0][0]).toContain('wp-config.php');
		});

		it('does not create a second watcher if already watching the same site', () => {
			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');
			manager.watchSite('test-site-id');

			expect(fs.watch).toHaveBeenCalledTimes(1);
		});

		it('creates separate watchers for different sites', () => {
			const manager = createWatcherManager(deps);
			manager.watchSite('site-1');
			manager.watchSite('site-2');

			expect(fs.watch).toHaveBeenCalledTimes(2);
		});

		it('logs a warning if fs.watch throws', () => {
			fs.watch.mockImplementation(() => {
				throw new Error('ENOENT');
			});

			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');

			expect(logger.warn).toHaveBeenCalledTimes(1);
			expect(logger.warn.mock.calls[0][0]).toContain('Could not watch');
		});

		it('ignores non-"change" events', async () => {
			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');

			watchCallback('rename');

			await Promise.resolve();

			expect(wpCli.run).not.toHaveBeenCalled();
		});

		it('re-fetches debug constants on "change" event', async () => {
			wpCli.run.mockResolvedValue('1');

			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');

			watchCallback('change');

			// Flush the async callback chain
			await new Promise((r) => setImmediate(r));

			// fetchDebugConstants calls wpCli.run 4 times (once per constant)
			expect(wpCli.run).toHaveBeenCalledTimes(4);
		});

		it('suppresses re-fetch when selfWriting is active', async () => {
			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');
			manager.markSelfWriting('test-site-id');

			watchCallback('change');

			await new Promise((r) => setImmediate(r));

			expect(wpCli.run).not.toHaveBeenCalled();
		});

		it('sends IPC event after re-fetching on external change', async () => {
			wpCli.run.mockResolvedValue('1');

			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');

			watchCallback('change');

			await new Promise((r) => setImmediate(r));

			expect(LocalMain.sendIPCEvent).toHaveBeenCalled();
		});
	});

	describe('unwatchSite', () => {
		it('closes the watcher for the given site', () => {
			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');
			manager.unwatchSite('test-site-id');

			expect(mockWatcherClose).toHaveBeenCalledTimes(1);
		});

		it('does nothing if no watcher exists for the site', () => {
			const manager = createWatcherManager(deps);
			manager.unwatchSite('nonexistent-site');
			expect(mockWatcherClose).not.toHaveBeenCalled();
		});
	});

	describe('clearSelfWriting', () => {
		it('clears the selfWriting guard after the default delay', async () => {
			wpCli.run.mockResolvedValue('1');

			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');
			manager.markSelfWriting('test-site-id');

			// Change event while selfWriting -- should be suppressed
			watchCallback('change');
			await new Promise((r) => setImmediate(r));
			expect(wpCli.run).not.toHaveBeenCalled();

			// Clear the guard and advance past the 500ms delay
			manager.clearSelfWriting('test-site-id');
			jest.advanceTimersByTime(500);

			// Now a change event should trigger a re-fetch
			watchCallback('change');
			await new Promise((r) => setImmediate(r));
			expect(wpCli.run).toHaveBeenCalled();
		});

		it('does not clear before the delay elapses', async () => {
			wpCli.run.mockResolvedValue('1');

			const manager = createWatcherManager(deps);
			manager.watchSite('test-site-id');
			manager.markSelfWriting('test-site-id');
			manager.clearSelfWriting('test-site-id');

			// Advance only 400ms (less than the 500ms default)
			jest.advanceTimersByTime(400);

			watchCallback('change');
			await new Promise((r) => setImmediate(r));

			// Should still be suppressed
			expect(wpCli.run).not.toHaveBeenCalled();
		});
	});
});
