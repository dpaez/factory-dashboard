import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { factory } from '$lib/factory/fixtures';

import { FAKE_FACTORY_TOKEN, createFakeFactory } from '../../test/fake-factory';
import { load } from './+layout.server';

vi.mock('$env/dynamic/private', () => ({
	env: {
		get FACTORY_API_URL() {
			return process.env.FACTORY_API_URL;
		},
		get FACTORY_API_TOKEN() {
			return process.env.FACTORY_API_TOKEN;
		},
		get FACTORY_OPERATOR_NAME() {
			return process.env.FACTORY_OPERATOR_NAME;
		}
	}
}));

const FACTORY_URL = 'http://factory.layout-test.internal:7731';

beforeEach(() => {
	process.env.FACTORY_API_URL = FACTORY_URL;
	process.env.FACTORY_API_TOKEN = FAKE_FACTORY_TOKEN;
});

afterEach(() => {
	delete process.env.FACTORY_API_URL;
	delete process.env.FACTORY_API_TOKEN;
});

async function run(options: Parameters<typeof createFakeFactory>[0] = {}) {
	const fake = createFakeFactory(options);
	const event = { fetch: fake.handle } as unknown as Parameters<typeof load>[0];
	return { data: await load(event), requests: fake.requests };
}

describe('layout load', () => {
	it('reads GET /v1/factory and passes its name', async () => {
		const { data, requests } = await run();
		expect(requests).toEqual([{ method: 'GET', path: '/v1/factory' }]);
		expect(data.companyName).toBe(factory.name);
	});

	it('uses an empty string when FACTORY.json name is null', async () => {
		const { data } = await run({ factoryName: null });
		expect(data.companyName).toBe('');
	});

	it('uses an empty string when the factory read fails', async () => {
		const event = {
			fetch: async () => new Response('nope', { status: 500 })
		} as unknown as Parameters<typeof load>[0];
		expect((await load(event)).companyName).toBe('');
	});

	it('uses an empty string when the factory is not configured', async () => {
		delete process.env.FACTORY_API_URL;
		const event = { fetch: async () => new Response() } as unknown as Parameters<typeof load>[0];
		expect((await load(event)).companyName).toBe('');
	});
});
