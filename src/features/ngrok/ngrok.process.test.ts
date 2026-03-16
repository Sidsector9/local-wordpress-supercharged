import { EventEmitter } from 'events';
import {
	extractDomain,
	startNgrokProcess,
	stopNgrokProcess,
	isNgrokProcessRunning,
	resolveNgrokBin,
	fetchNgrokTunnels,
	findTunnelByDomain,
	deleteTunnel,
	getNgrokProcessStatus,
} from './ngrok.process';

jest.mock('child_process', () => ({
	spawn: jest.fn(),
	execFileSync: jest.fn(() => '/opt/homebrew/bin/ngrok\n'),
}));

jest.mock('http', () => ({
	get: jest.fn(),
	request: jest.fn(),
}));

import { spawn } from 'child_process';
import * as http from 'http';

function createMockChild(): EventEmitter & { kill: jest.Mock; stderr: EventEmitter } {
	const emitter = new EventEmitter();
	(emitter as any).kill = jest.fn();
	(emitter as any).stderr = new EventEmitter();
	return emitter as any;
}

function mockHttpGetResponse(body: any): void {
	(http.get as jest.Mock).mockImplementation((_url: string, _opts: any, cb: Function) => {
		const res = new EventEmitter();
		cb(res);
		res.emit('data', Buffer.from(JSON.stringify(body)));
		res.emit('end');
		const req = new EventEmitter();
		return req;
	});
}

function mockHttpGetError(): void {
	(http.get as jest.Mock).mockImplementation((_url: string, _opts: any, _cb: Function) => {
		const req = new EventEmitter();
		process.nextTick(() => req.emit('error', new Error('connect ECONNREFUSED')));
		return req;
	});
}

function mockHttpRequestResponse(statusCode: number): void {
	(http.request as jest.Mock).mockImplementation((_opts: any, cb: Function) => {
		const res = new EventEmitter() as any;
		res.statusCode = statusCode;
		res.resume = jest.fn();
		const req = new EventEmitter() as any;
		req.end = jest.fn(() => {
			process.nextTick(() => cb(res));
		});
		return req;
	});
}

describe('extractDomain', () => {
	it('strips https:// and trailing slash', () => {
		expect(extractDomain('https://foo.ngrok-free.dev/')).toBe('foo.ngrok-free.dev');
	});

	it('strips http://', () => {
		expect(extractDomain('http://bar.ngrok.io')).toBe('bar.ngrok.io');
	});

	it('handles bare domain', () => {
		expect(extractDomain('baz.ngrok-free.dev')).toBe('baz.ngrok-free.dev');
	});
});

describe('fetchNgrokTunnels', () => {
	it('returns tunnels from the API', async () => {
		mockHttpGetResponse({
			tunnels: [{ name: 't1', public_url: 'https://foo.ngrok-free.dev' }],
		});

		const tunnels = await fetchNgrokTunnels();
		expect(tunnels).toHaveLength(1);
	});

	it('returns empty array on connection error', async () => {
		mockHttpGetError();
		expect(await fetchNgrokTunnels()).toEqual([]);
	});
});

describe('findTunnelByDomain', () => {
	it('returns tunnel when domain matches', async () => {
		mockHttpGetResponse({
			tunnels: [{ name: 't1', public_url: 'https://foo.ngrok-free.dev' }],
		});

		const tunnel = await findTunnelByDomain('https://foo.ngrok-free.dev');
		expect(tunnel).toBeDefined();
		expect(tunnel!.name).toBe('t1');
	});

	it('returns undefined when no match', async () => {
		mockHttpGetResponse({
			tunnels: [{ name: 't1', public_url: 'https://bar.ngrok-free.dev' }],
		});

		expect(await findTunnelByDomain('https://foo.ngrok-free.dev')).toBeUndefined();
	});
});

describe('deleteTunnel', () => {
	it('resolves on 204', async () => {
		mockHttpRequestResponse(204);
		await expect(deleteTunnel('t1')).resolves.toBeUndefined();
	});

	it('resolves on 404', async () => {
		mockHttpRequestResponse(404);
		await expect(deleteTunnel('t1')).resolves.toBeUndefined();
	});

	it('rejects on other status codes', async () => {
		mockHttpRequestResponse(500);
		await expect(deleteTunnel('t1')).rejects.toThrow('HTTP 500');
	});
});

describe('startNgrokProcess', () => {
	let mockChild: ReturnType<typeof createMockChild>;

	beforeEach(() => {
		jest.clearAllMocks();
		mockChild = createMockChild();
		(spawn as jest.Mock).mockReturnValue(mockChild);
		mockHttpGetError();
	});

	afterEach(() => {
		stopNgrokProcess('s1');
		stopNgrokProcess('s2');
	});

	it('spawns ngrok with correct args', async () => {
		const ngrokBin = resolveNgrokBin();
		await startNgrokProcess('s1', 'https://foo.ngrok-free.dev', 'mysite.local', 80, jest.fn());

		expect(spawn).toHaveBeenCalledWith(
			ngrokBin,
			['http', '--domain=foo.ngrok-free.dev', 'mysite.local:80'],
			{ stdio: ['ignore', 'ignore', 'pipe'], detached: false },
		);
		expect(isNgrokProcessRunning('s1')).toBe(true);
	});

	it('deletes existing tunnel before spawning', async () => {
		mockHttpGetResponse({
			tunnels: [{ name: 'old', public_url: 'https://foo.ngrok-free.dev' }],
		});
		mockHttpRequestResponse(204);

		await startNgrokProcess('s1', 'https://foo.ngrok-free.dev', 'mysite.local', 80, jest.fn());

		expect(http.request).toHaveBeenCalled();
		expect(spawn).toHaveBeenCalled();
	});

	it('calls onExit without error on clean exit', async () => {
		const onExit = jest.fn();
		await startNgrokProcess('s1', 'https://foo.ngrok-free.dev', 'mysite.local', 80, onExit);

		mockChild.emit('exit', 0);

		expect(onExit).toHaveBeenCalledWith('s1', undefined);
		expect(isNgrokProcessRunning('s1')).toBe(false);
	});

	it('calls onExit with stderr on non-zero exit', async () => {
		const onExit = jest.fn();
		await startNgrokProcess('s1', 'https://foo.ngrok-free.dev', 'mysite.local', 80, onExit);

		mockChild.stderr.emit('data', Buffer.from('auth token invalid'));
		mockChild.emit('exit', 1);

		expect(onExit).toHaveBeenCalledWith('s1', 'auth token invalid');
	});

	it('calls onExit with ENOENT message when ngrok not found', async () => {
		const onExit = jest.fn();
		await startNgrokProcess('s1', 'https://foo.ngrok-free.dev', 'mysite.local', 80, onExit);

		const err = new Error('spawn ngrok ENOENT') as NodeJS.ErrnoException;
		err.code = 'ENOENT';
		mockChild.emit('error', err);

		expect(onExit).toHaveBeenCalledWith('s1', 'ngrok not found -- is it installed and on your PATH?');
	});

	it('only calls onExit once when both error and exit fire', async () => {
		const onExit = jest.fn();
		await startNgrokProcess('s1', 'https://foo.ngrok-free.dev', 'mysite.local', 80, onExit);

		const err = new Error('spawn ngrok ENOENT') as NodeJS.ErrnoException;
		err.code = 'ENOENT';
		mockChild.emit('error', err);
		mockChild.emit('exit', 1);

		expect(onExit).toHaveBeenCalledTimes(1);
	});
});

describe('stopNgrokProcess', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(spawn as jest.Mock).mockReturnValue(createMockChild());
		mockHttpGetError();
	});

	it('kills the process', async () => {
		const child = createMockChild();
		(spawn as jest.Mock).mockReturnValue(child);
		await startNgrokProcess('s1', 'https://foo.ngrok-free.dev', 'mysite.local', 80, jest.fn());

		stopNgrokProcess('s1');

		expect(child.kill).toHaveBeenCalledWith('SIGTERM');
		expect(isNgrokProcessRunning('s1')).toBe(false);
	});

	it('is a no-op when no process is running', () => {
		expect(() => stopNgrokProcess('nonexistent')).not.toThrow();
	});
});

describe('getNgrokProcessStatus', () => {
	it('returns running when enabled and tunnel found', async () => {
		mockHttpGetResponse({
			tunnels: [{ name: 't1', public_url: 'https://foo.ngrok-free.dev' }],
		});

		expect(await getNgrokProcessStatus('https://foo.ngrok-free.dev', true)).toBe('running');
	});

	it('returns stopped when not enabled even if tunnel found', async () => {
		mockHttpGetResponse({
			tunnels: [{ name: 't1', public_url: 'https://foo.ngrok-free.dev' }],
		});

		expect(await getNgrokProcessStatus('https://foo.ngrok-free.dev', false)).toBe('stopped');
	});

	it('returns stopped when enabled but no tunnel found', async () => {
		mockHttpGetError();
		expect(await getNgrokProcessStatus('https://foo.ngrok-free.dev', true)).toBe('stopped');
	});

	it('returns stopped when no URL provided', async () => {
		expect(await getNgrokProcessStatus()).toBe('stopped');
	});
});
