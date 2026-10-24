/* The fake factory's start: what e2e relies on to prove the Start flow. */
import { describe, expect, it } from 'vitest';

import {
	FAKE_FACTORY_TOKEN,
	createFakeFactory,
	type FakeFactoryOptions
} from '../../../test/fake-factory';
import { backlogBlockedIssue, backlogIssuePlain, backlogUmbrellaIssue } from './fixtures';
import type { components } from './generated/factory-api';

type Schemas = components['schemas'];

const BASE = 'http://fake.test';
const auth = { authorization: `Bearer ${FAKE_FACTORY_TOKEN}` };
const backlog = [backlogIssuePlain, backlogUmbrellaIssue, backlogBlockedIssue];

function setup(options: FakeFactoryOptions = {}) {
	const fake = createFakeFactory({ backlog, startAddsTicket: true, ...options });
	const start = async (body: unknown, key: string) => {
		const response = await fake.handle(
			new Request(`${BASE}/v1/tickets`, {
				method: 'POST',
				headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': key },
				body: JSON.stringify(body)
			})
		);
		return { status: response.status, body: (await response.json()) as Schemas['CommandAccepted'] };
	};
	const get = async <T>(path: string) =>
		(await (await fake.handle(new Request(`${BASE}${path}`, { headers: auth }))).json()) as T;
	const tickets = () => get<Schemas['TicketPage']>('/v1/tickets?status=all&limit=50');
	/** Every page of the backlog: one read. */
	const backlogIds = async () => {
		const ids: string[] = [];
		let cursor: string | null = '0';
		while (cursor !== null) {
			const page: Schemas['BacklogPage'] = await get(`/v1/backlog?cursor=${cursor}`);
			ids.push(...page.items.map((item) => item.id));
			cursor = page.nextCursor;
		}
		return ids;
	};
	const allTickets = async () => {
		const items: Schemas['TicketSummary'][] = [];
		let cursor: string | null = '0';
		while (cursor !== null) {
			const page: Schemas['TicketPage'] = await get(`/v1/tickets?status=all&cursor=${cursor}`);
			items.push(...page.items);
			cursor = page.nextCursor;
		}
		return items;
	};
	return { fake, start, get, tickets, allTickets, backlogIds };
}

describe('fake factory start with startAddsTicket', () => {
	it('adds the started ticket in plan, with the issue id, and drops the backlog issue', async () => {
		const { fake, start, get, allTickets, backlogIds } = setup();
		const answer = await start({ ref: backlogIssuePlain.displayRef }, 'key-1');
		expect(answer.status).toBe(202);
		expect(answer.body.ticket).toBe('fake-started-00000001');

		const ticket = (await allTickets()).find((item) => item.key === answer.body.ticket);
		expect(ticket).toMatchObject({
			id: backlogIssuePlain.id,
			displayRef: backlogIssuePlain.displayRef,
			title: backlogIssuePlain.title,
			stage: 'plan',
			status: 'queued'
		});
		const detail = await get<Schemas['TicketDetail']>(`/v1/tickets/${answer.body.ticket}`);
		expect(detail).toMatchObject({ key: answer.body.ticket, stage: 'plan', status: 'queued' });

		expect(await backlogIds()).not.toContain(backlogIssuePlain.id);
		const events = fake.emit({ kind: 'probe', payload: { ...emptyPayload } });
		expect(events.revision).toBe(answer.body.revision + 1);
	});

	it('names the new ticket in the start event', async () => {
		const { fake, start } = setup();
		const streamed: string[] = [];
		const response = await fake.handle(new Request(`${BASE}/v1/events?since=0`, { headers: auth }));
		const reader = response.body!.getReader();
		const answer = await start({ ref: backlogIssuePlain.displayRef }, 'key-1');
		const decoder = new TextDecoder();
		while (!streamed.join('').includes('event: start')) {
			const { value } = await reader.read();
			streamed.push(decoder.decode(value));
		}
		await reader.cancel();
		expect(streamed.join('')).toContain(`"ticket":"${answer.body.ticket}"`);
	});

	it('replays a repeated idempotency key without adding a second ticket', async () => {
		const { start, allTickets } = setup();
		const before = (await allTickets()).length;
		const first = await start({ ref: backlogIssuePlain.displayRef }, 'same-key');
		const again = await start({ ref: backlogIssuePlain.displayRef }, 'same-key');
		expect(again).toEqual(first);
		const after = await allTickets();
		expect(after.length).toBe(before + 1);
		expect(after.filter((item) => item.key.startsWith('fake-started-'))).toHaveLength(1);
	});

	it('starts a written brief with its id', async () => {
		const { start, allTickets } = setup();
		const answer = await start({ id: 'dark-mode-audit', text: 'Audit dark mode\nDetails.' }, 'k');
		const ticket = (await allTickets()).find((item) => item.key === answer.body.ticket);
		expect(ticket).toMatchObject({
			id: 'dark-mode-audit',
			title: 'Audit dark mode',
			stage: 'plan'
		});
	});

	it('with startKeepsBacklogIssue, lists the started issue for one more read', async () => {
		const { start, backlogIds } = setup({ startKeepsBacklogIssue: true });
		await start({ ref: backlogIssuePlain.displayRef }, 'key-1');
		expect(await backlogIds()).toContain(backlogIssuePlain.id);
		expect(await backlogIds()).not.toContain(backlogIssuePlain.id);
	});
});

describe('fake factory start by default', () => {
	it('answers a started key but adds no ticket and keeps the backlog', async () => {
		const { start, allTickets, backlogIds } = setup({ startAddsTicket: false });
		const before = (await allTickets()).length;
		const answer = await start({ ref: backlogIssuePlain.displayRef }, 'key-1');
		expect(answer.status).toBe(202);
		expect(answer.body.ticket).toBe('fake-started-00000001');
		expect((await allTickets()).length).toBe(before);
		expect(await backlogIds()).toContain(backlogIssuePlain.id);
	});
});

const emptyPayload: Schemas['EventPayload'] = {
	actor: { client: 'dashboard', onBehalfOf: null },
	card: null,
	run: null,
	task: null,
	ticket: null
};
