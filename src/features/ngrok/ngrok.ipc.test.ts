import 'jest-extended';

import * as LocalMain from '@getflywheel/local/main';
import { registerNgrokIpc, NgrokIpcDeps } from './ngrok.ipc';
import { IPC_CHANNELS } from '../../shared/types';
import { createMockSite, createMockWpCli, createMockSiteData, createMockLogger } from '../../test/mockCreators';
import * as ngrokProcess from './ngrok.process';

jest.mock('./ngrok.process');

describe('registerNgrokIpc', () => {
	let wpCli: ReturnType<typeof createMockWpCli>;
	let siteData: ReturnType<typeof createMockSiteData>;
	let logger: ReturnType<typeof createMockLogger>;
	let handlers: Record<string, Function>;

	beforeEach(() => {
		jest.clearAllMocks();

		wpCli = createMockWpCli();
		siteData = createMockSiteData();
		logger = createMockLogger();

		handlers = {};
		(LocalMain.addIpcAsyncListener as jest.Mock).mockImplementation(
			(channel: string, handler: Function) => { handlers[channel] = handler; },
		);

		(ngrokProcess.startNgrokProcess as jest.Mock).mockResolvedValue(undefined);

		registerNgrokIpc({ wpCli: wpCli as any, siteData: siteData as any, logger });
	});

	describe('GET_NGROK', () => {
		it('returns cached state', async () => {
			siteData.getSite.mockReturnValue(createMockSite({
				id: 's1',
				superchargedAddon: { ngrok: { enabled: true, url: 'x1' } },
			}));

			expect(await handlers[IPC_CHANNELS.GET_NGROK]('s1')).toEqual({ enabled: true, url: 'x1' });
		});

		it('returns defaults when no cache', async () => {
			siteData.getSite.mockReturnValue(createMockSite({ id: 's1' }));
			expect(await handlers[IPC_CHANNELS.GET_NGROK]('s1')).toEqual({ enabled: false, url: '' });
		});
	});

	describe('APPLY_NGROK', () => {
		it('writes URL to cache without wp-config changes', async () => {
			siteData.getSite.mockReturnValue(createMockSite({ id: 's1' }));

			await handlers[IPC_CHANNELS.APPLY_NGROK]('s1', 'x1');

			expect(siteData.updateSite.mock.calls[0][1].superchargedAddon.ngrok).toEqual({ enabled: false, url: 'x1' });
			expect(wpCli.run).not.toHaveBeenCalled();
		});
	});

	describe('ENABLE_NGROK -- enabling', () => {
		beforeEach(() => {
			wpCli.run.mockResolvedValue(undefined);
			siteData.getSites.mockReturnValue({});
		});

		it('sets WP_HOME and WP_SITEURL', async () => {
			const site = createMockSite({ id: 's1' });
			siteData.getSite.mockReturnValue(site);

			await handlers[IPC_CHANNELS.ENABLE_NGROK]('s1', true, 'x1');

			const allArgs = wpCli.run.mock.calls.map((c: any[]) => c[1]);
			expect(allArgs).toContainEqual(['config', 'set', 'WP_HOME', 'x1', '--add', `--path=${site.path}`]);
			expect(allArgs).toContainEqual(['config', 'set', 'WP_SITEURL', 'x1', '--add', `--path=${site.path}`]);
		});

		it('writes enabled cache', async () => {
			siteData.getSite.mockReturnValue(createMockSite({ id: 's1' }));
			await handlers[IPC_CHANNELS.ENABLE_NGROK]('s1', true, 'x1');
			expect(siteData.updateSite.mock.calls[0][1].superchargedAddon.ngrok).toEqual({ enabled: true, url: 'x1' });
		});
	});

	describe('ENABLE_NGROK -- disabling', () => {
		it('stops process, removes constants, preserves URL', async () => {
			const site = createMockSite({ id: 's1' });
			siteData.getSite.mockReturnValue(site);
			wpCli.run.mockResolvedValue(undefined);

			await handlers[IPC_CHANNELS.ENABLE_NGROK]('s1', false, 'x1');

			expect(ngrokProcess.stopNgrokProcess).toHaveBeenCalledWith('s1');

			const allArgs = wpCli.run.mock.calls.map((c: any[]) => c[1]);
			expect(allArgs).toContainEqual(['config', 'delete', 'WP_HOME', `--path=${site.path}`]);
			expect(allArgs).toContainEqual(['config', 'delete', 'WP_SITEURL', `--path=${site.path}`]);

			expect(siteData.updateSite.mock.calls[0][1].superchargedAddon.ngrok).toEqual({ enabled: false, url: 'x1' });
		});
	});

	describe('ENABLE_NGROK -- collision', () => {
		it('disables conflicting site and sends events', async () => {
			const conflict = createMockSite({
				id: 's1',
				superchargedAddon: { ngrok: { enabled: true, url: 'x1' } },
			});
			const current = createMockSite({ id: 's2' });

			siteData.getSite.mockImplementation((id: string) => id === 's1' ? conflict : current);
			siteData.getSites.mockReturnValue({ 's1': conflict, 's2': current });
			wpCli.run.mockResolvedValue(undefined);

			await handlers[IPC_CHANNELS.ENABLE_NGROK]('s2', true, 'x1');

			expect(ngrokProcess.stopNgrokProcess).toHaveBeenCalledWith('s1');
			expect(wpCli.run).toHaveBeenCalledTimes(4);
			expect(LocalMain.sendIPCEvent).toHaveBeenCalledWith(IPC_CHANNELS.NGROK_CHANGED, 's1', false);
			expect(LocalMain.sendIPCEvent).toHaveBeenCalledWith(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, 's1', 'stopped');
		});

		it('does not send events when no conflicts', async () => {
			siteData.getSite.mockReturnValue(createMockSite({ id: 's1' }));
			siteData.getSites.mockReturnValue({ 's1': createMockSite({ id: 's1' }) });
			wpCli.run.mockResolvedValue(undefined);

			await handlers[IPC_CHANNELS.ENABLE_NGROK]('s1', true, 'x1');
			expect(LocalMain.sendIPCEvent).not.toHaveBeenCalled();
		});
	});

	describe('CLEAR_NGROK', () => {
		it('stops process and removes constants when enabled', async () => {
			siteData.getSite.mockReturnValue(createMockSite({
				id: 's1',
				superchargedAddon: { ngrok: { enabled: true, url: 'x1' } },
			}));
			wpCli.run.mockResolvedValue(undefined);

			await handlers[IPC_CHANNELS.CLEAR_NGROK]('s1');

			expect(ngrokProcess.stopNgrokProcess).toHaveBeenCalledWith('s1');
			expect(wpCli.run).toHaveBeenCalledTimes(2);
		});

		it('stops process even when not enabled', async () => {
			siteData.getSite.mockReturnValue(createMockSite({
				id: 's1',
				superchargedAddon: { ngrok: { enabled: false, url: 'x1' } },
			}));

			await handlers[IPC_CHANNELS.CLEAR_NGROK]('s1');

			expect(ngrokProcess.stopNgrokProcess).toHaveBeenCalledWith('s1');
			expect(wpCli.run).not.toHaveBeenCalled();
		});
	});

	describe('START_NGROK_PROCESS', () => {
		it('starts process and sends running status', async () => {
			const site = createMockSite({
				id: 's1',
				superchargedAddon: { ngrok: { enabled: true, url: 'https://foo.ngrok-free.dev' } },
			});
			(site as any).domain = 'mysite.local';
			(site as any).httpPort = 8080;
			siteData.getSite.mockReturnValue(site);

			await handlers[IPC_CHANNELS.START_NGROK_PROCESS]('s1');

			expect(ngrokProcess.startNgrokProcess).toHaveBeenCalledWith(
				's1', 'https://foo.ngrok-free.dev', 'mysite.local', 8080, expect.any(Function),
			);
			expect(LocalMain.sendIPCEvent).toHaveBeenCalledWith(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, 's1', 'running');
		});

		it('throws when no URL configured', async () => {
			siteData.getSite.mockReturnValue(createMockSite({ id: 's1' }));
			await expect(handlers[IPC_CHANNELS.START_NGROK_PROCESS]('s1')).rejects.toThrow('No ngrok URL configured');
		});

		it('onExit callback forwards error to renderer', async () => {
			const site = createMockSite({
				id: 's1',
				superchargedAddon: { ngrok: { enabled: true, url: 'https://foo.ngrok-free.dev' } },
			});
			(site as any).domain = 'mysite.local';
			(site as any).httpPort = 80;
			siteData.getSite.mockReturnValue(site);

			await handlers[IPC_CHANNELS.START_NGROK_PROCESS]('s1');

			const onExit = (ngrokProcess.startNgrokProcess as jest.Mock).mock.calls[0][4];
			onExit('s1', 'auth token invalid');

			expect(LocalMain.sendIPCEvent).toHaveBeenCalledWith(
				IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, 's1', 'stopped', 'auth token invalid',
			);
		});
	});

	describe('STOP_NGROK_PROCESS', () => {
		it('stops process and sends stopped status', async () => {
			await handlers[IPC_CHANNELS.STOP_NGROK_PROCESS]('s1');
			expect(ngrokProcess.stopNgrokProcess).toHaveBeenCalledWith('s1');
			expect(LocalMain.sendIPCEvent).toHaveBeenCalledWith(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, 's1', 'stopped');
		});
	});

	describe('GET_NGROK_PROCESS_STATUS', () => {
		it('queries with cached URL and enabled flag', async () => {
			(ngrokProcess.getNgrokProcessStatus as jest.Mock).mockResolvedValue('running');
			siteData.getSite.mockReturnValue(createMockSite({
				id: 's1',
				superchargedAddon: { ngrok: { enabled: true, url: 'https://foo.ngrok-free.dev' } },
			}));

			expect(await handlers[IPC_CHANNELS.GET_NGROK_PROCESS_STATUS]('s1')).toBe('running');
			expect(ngrokProcess.getNgrokProcessStatus).toHaveBeenCalledWith('https://foo.ngrok-free.dev', true);
		});

		it('returns stopped when no cache', async () => {
			(ngrokProcess.getNgrokProcessStatus as jest.Mock).mockResolvedValue('stopped');
			siteData.getSite.mockReturnValue(createMockSite({ id: 's1' }));
			expect(await handlers[IPC_CHANNELS.GET_NGROK_PROCESS_STATUS]('s1')).toBe('stopped');
		});
	});
});
