import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { test as base, expect, type Page } from '@playwright/test';

import {
	FAKE_FACTORY_TOKEN,
	startFakeFactory,
	type FakeCommandRequest,
	type FakeEvent,
	type FakeEventConnection,
	type FakeEventInput,
	type FakeFactoryOptions,
	type RunningFakeFactory
} from './fake-factory.ts';

export { expect };
export { gotoLive } from './live.ts';

/**
 * The shared e2e fixture. Each Playwright worker starts one fake factory and
 * one production build (`node build`, built once per run by
 * `test/global-setup.ts`) pointed at it, both on free ports the worker picked
 * itself, so runs never collide and never reuse a server they did not start.
 *
 * Every test resets the fake to its `fakeOptions` (default: none), which drops
 * open event streams and empties the request, command and event logs. Choose
 * options per describe or test with `test.use({ fakeOptions: { ... } })`; the
 * app keeps running. A refused token is `fakeOptions: { token: 'other' }`.
 */

/** The fake factory as a test sees it: where it listens and what it received. */
export type FakeFixture = {
	/** `http://127.0.0.1:<port>`, the app's `FACTORY_API_URL`: must never reach a page. */
	url: string;
	/** The token the app sends: must never reach a page. */
	token: string;
	/** Every request the app sent to the fake in this test, in order. */
	requests(): { method: string; path: string }[];
	/** Every command the fake received in this test, replays and refusals included. */
	commands(): FakeCommandRequest[];
	/** The `from`/`to` of every `/v1/stats/export` read in this test. */
	exportRequests(): { from: string | null; to: string | null }[];
	/** What each `/v1/events` connection sent, and whether it is still open. */
	connections(): FakeEventConnection[];
	/** How many `/v1/events` streams are open now. */
	openStreams(): number;
	/** Append an event (optionally adding its ticket) and send it to every open stream. */
	emit(input: FakeEventInput): FakeEvent;
	/** Close every open event stream, as a dropped connection would. */
	dropStreams(): void;
};

/** The worker's built app. */
export type AppFixture = { url: string };

type TestFixtures = {
	/** The fake factory options for this test (default `{}`): `test.use({ fakeOptions })`. */
	fakeOptions: FakeFactoryOptions;
	fake: FakeFixture;
	/** Save a full-page screenshot `<name>.png` into `$QA_SCREENSHOTS`, when it is set. */
	shot: (name: string, page?: Page) => Promise<void>;
};

type WorkerFixtures = {
	fakeFactory: RunningFakeFactory;
	app: AppFixture;
};

/** A port free on 127.0.0.1 right now. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			server.close(() => resolve(port));
		});
	});
}

/**
 * Start `node build` on a free port against `factoryUrl`; resolves with its
 * origin. The port is picked first so the app knows its `ORIGIN`: without it,
 * adapter-node assumes `https://` and the command endpoint refuses the
 * browser's own posts as cross-origin. A port taken in between is retried.
 */
async function startApp(factoryUrl: string): Promise<{ url: string; process: ChildProcess }> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await startAppOn(await freePort(), factoryUrl);
		} catch (error) {
			if (attempt >= 3 || !String(error).includes('EADDRINUSE')) throw error;
		}
	}
}

async function startAppOn(
	port: number,
	factoryUrl: string
): Promise<{ url: string; process: ChildProcess }> {
	// Name it `localhost`: the page then never carries a `127.0.0.1` origin,
	// which the leak checks reserve for the fake factory.
	const origin = `http://localhost:${port}`;
	const child = spawn(process.execPath, ['build'], {
		env: {
			...process.env,
			HOST: '127.0.0.1',
			PORT: String(port),
			ORIGIN: origin,
			FACTORY_API_URL: factoryUrl,
			FACTORY_API_TOKEN: FAKE_FACTORY_TOKEN
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let output = '';
	const url = await new Promise<string>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`node build did not listen within 30 s:\n${output}`)),
			30_000
		);
		const onData = (chunk: Buffer) => {
			output += chunk.toString('utf8');
			if (!/Listening on http:\/\/\S+/.test(output)) return;
			clearTimeout(timer);
			child.stdout?.off('data', onData);
			resolve(origin);
		};
		child.stdout?.on('data', onData);
		child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
		child.once('exit', (code) => {
			clearTimeout(timer);
			reject(new Error(`node build exited with ${code} before listening:\n${output}`));
		});
	});
	// Keep draining the pipes so a chatty server never blocks on a full buffer.
	child.stdout?.resume();
	child.stderr?.resume();
	return { url, process: child };
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
	fakeFactory: [
		async ({}, use) => {
			const running = await startFakeFactory(0);
			await use(running);
			await new Promise((resolve) => running.server.close(resolve));
		},
		{ scope: 'worker' }
	],

	app: [
		async ({ fakeFactory }, use) => {
			const { url, process: child } = await startApp(fakeFactory.url);
			await use({ url });
			const exited = new Promise((resolve) => child.once('exit', resolve));
			child.kill();
			await exited;
		},
		// A worker fixture has its own budget, not the test's 30 s: `startApp`
		// allows up to 30 s for `node build` to listen, plus one port retry.
		{ scope: 'worker', timeout: 60_000 }
	],

	baseURL: async ({ app }, use) => use(app.url),

	fakeOptions: [{}, { option: true }],

	fake: [
		async ({ fakeFactory, fakeOptions }, use) => {
			fakeFactory.reset(fakeOptions);
			const current = () => fakeFactory.current();
			await use({
				url: fakeFactory.url,
				token: FAKE_FACTORY_TOKEN,
				requests: () => current().requests,
				commands: () => current().commands,
				exportRequests: () => current().exportRequests,
				connections: () => current().connections,
				openStreams: () => current().openStreams(),
				emit: (input) => current().emit(input),
				dropStreams: () => current().dropStreams()
			});
		},
		// Every test starts from a fresh fake, whether it asks for `fake` or not.
		{ auto: true }
	],

	shot: async ({ page }, use) => {
		const dir = process.env.QA_SCREENSHOTS;
		await use(async (name, target = page) => {
			if (dir) await target.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
		});
	}
});
