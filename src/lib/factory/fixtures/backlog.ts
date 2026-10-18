/* Backlog fixtures: a plain backlog issue, an umbrella issue and a blocked issue. */
import type { components } from '$lib/factory/generated/factory-api';

type Schemas = components['schemas'];

export const backlogIssuePlain = {
	blocked: false,
	blockedBy: [],
	children: [],
	displayRef: 'dpaez/factory-dashboard#30',
	id: 'issue_30',
	labels: ['enhancement'],
	title: 'Dark mode contrast pass',
	umbrella: false,
	url: 'https://github.com/dpaez/factory-dashboard/issues/30'
} satisfies Schemas['BacklogIssue'];

/** An umbrella issue: it has sub-issues, so start those instead. */
export const backlogUmbrellaIssue = {
	blocked: false,
	blockedBy: [],
	children: [
		{
			displayRef: 'dpaez/factory-dashboard#17',
			title: 'API contract and typed server client',
			url: 'https://github.com/dpaez/factory-dashboard/issues/17'
		},
		{
			displayRef: 'dpaez/factory-dashboard#21',
			title: 'Switch routes to the factory API',
			url: 'https://github.com/dpaez/factory-dashboard/issues/21'
		}
	],
	displayRef: 'dpaez/factory-dashboard#16',
	id: 'issue_16',
	labels: ['epic'],
	title: 'Factory API command center',
	umbrella: true,
	url: 'https://github.com/dpaez/factory-dashboard/issues/16'
} satisfies Schemas['BacklogIssue'];

/** A blocked issue: another issue blocks it. */
export const backlogBlockedIssue = {
	blocked: true,
	blockedBy: [
		{
			displayRef: 'dpaez/factory-dashboard#21',
			title: 'Switch routes to the factory API',
			url: 'https://github.com/dpaez/factory-dashboard/issues/21'
		},
		{ displayRef: 'KAI-7', title: 'Tracker auth', url: null }
	],
	children: [],
	displayRef: 'dpaez/factory-dashboard#28',
	id: 'issue_28',
	labels: [],
	title: 'Typed commands with idempotency keys',
	umbrella: false,
	url: 'https://github.com/dpaez/factory-dashboard/issues/28'
} satisfies Schemas['BacklogIssue'];

export const backlogPage = {
	fetchedAt: '2026-10-13T11:00:00Z',
	items: [backlogIssuePlain, backlogUmbrellaIssue, backlogBlockedIssue],
	nextCursor: 'backlog-cursor-2'
} satisfies Schemas['BacklogPage'];
