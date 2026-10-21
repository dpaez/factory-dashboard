/*
 * Backlog fixtures: plain, umbrella, blocked, planned-field, many-label,
 * childless umbrella and blocked umbrella issues, and three backlog pages.
 */
import type { components } from '$lib/factory/generated/factory-api';
import type { PlannedIssueFields } from '$lib/factory/backlog';

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

/** A ready issue carrying the planned author, times and markdown description. */
export const backlogIssueWithDetails = {
	author: 'dpaez',
	blocked: false,
	blockedBy: [],
	children: [],
	createdAt: '2026-10-01T09:30:00Z',
	description: [
		'## Why',
		'',
		'The board needs a [Backlog lane](https://github.com/dpaez/factory-dashboard/issues/24).',
		'',
		'- show labels',
		'- show availability',
		'',
		'Run `pnpm test` before handoff.',
		'',
		'<script>alert("xss")</script>',
		'',
		'<img src=x onerror="alert(1)"> and [bad link](javascript:alert(1))'
	].join('\n'),
	displayRef: 'dpaez/factory-dashboard#31',
	id: 'issue_31',
	labels: ['enhancement', 'ui'],
	title: 'Keyboard shortcuts for the board',
	umbrella: false,
	updatedAt: '2026-10-12T16:45:00Z',
	url: 'https://github.com/dpaez/factory-dashboard/issues/31'
} satisfies Schemas['BacklogIssue'] & PlannedIssueFields;

/** A ready issue with no labels and no planned fields. */
export const backlogIssueBare = {
	blocked: false,
	blockedBy: [],
	children: [],
	displayRef: 'KAI-12',
	id: 'issue_kai_12',
	labels: [],
	title: 'Retry policy for tracker reads',
	umbrella: false,
	url: 'https://linear.app/kai/issue/KAI-12'
} satisfies Schemas['BacklogIssue'];

/** A ready issue with many labels, some of them long. */
export const backlogIssueManyLabels = {
	blocked: false,
	blockedBy: [],
	children: [],
	displayRef: 'dpaez/factory-dashboard#33',
	id: 'issue_33',
	labels: [
		'enhancement',
		'ui',
		'accessibility',
		'good first issue',
		'needs-design-review-before-implementation',
		'performance',
		'documentation',
		'area/flow-board-and-backlog-lane',
		'p2'
	],
	title: 'Label overflow on narrow lanes',
	umbrella: false,
	url: 'https://github.com/dpaez/factory-dashboard/issues/33'
} satisfies Schemas['BacklogIssue'];

/** An umbrella issue whose sub-issues the tracker did not list. */
export const backlogUmbrellaNoChildren = {
	blocked: false,
	blockedBy: [],
	children: [],
	displayRef: 'dpaez/factory-dashboard#40',
	id: 'issue_40',
	labels: ['epic'],
	title: 'Operator analytics',
	umbrella: true,
	url: 'https://github.com/dpaez/factory-dashboard/issues/40'
} satisfies Schemas['BacklogIssue'];

/** An umbrella issue that is also blocked: Umbrella wins, blockers stay listed. */
export const backlogBlockedUmbrella = {
	blocked: true,
	blockedBy: [
		{
			displayRef: 'dpaez/factory-dashboard#22',
			title: 'Live updates over SSE',
			url: 'https://github.com/dpaez/factory-dashboard/issues/22'
		}
	],
	children: [
		{
			displayRef: 'dpaez/factory-dashboard#42',
			title: 'Command palette',
			url: 'https://github.com/dpaez/factory-dashboard/issues/42'
		}
	],
	displayRef: 'dpaez/factory-dashboard#41',
	id: 'issue_41',
	labels: ['epic', 'ui'],
	title: 'Operator commands',
	umbrella: true,
	url: 'https://github.com/dpaez/factory-dashboard/issues/41'
} satisfies Schemas['BacklogIssue'];

/** The page after `backlogPage`: the last one. */
export const backlogPageLast = {
	fetchedAt: '2026-10-13T11:00:00Z',
	items: [
		backlogIssueWithDetails,
		backlogIssueBare,
		backlogIssueManyLabels,
		backlogUmbrellaNoChildren,
		backlogBlockedUmbrella
	],
	nextCursor: null
} satisfies Schemas['BacklogPage'];

export const backlogPageEmpty = {
	fetchedAt: '2026-10-13T11:00:00Z',
	items: [],
	nextCursor: null
} satisfies Schemas['BacklogPage'];

/** Every backlog fixture issue, in page order. */
export const backlogIssues: (Schemas['BacklogIssue'] & PlannedIssueFields)[] = [
	...backlogPage.items,
	...backlogPageLast.items
];
