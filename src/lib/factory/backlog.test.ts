import { describe, expect, it } from 'vitest';

import {
	backlogBlockedIssue,
	backlogBlockedUmbrella,
	backlogIssueBare,
	backlogIssueManyLabels,
	backlogIssuePlain,
	backlogIssues,
	backlogIssueWithDetails,
	backlogUmbrellaIssue,
	backlogUmbrellaNoChildren
} from '$lib/factory/fixtures';

import {
	backlogLabels,
	filterByLabel,
	readyToStart,
	toBacklogCard,
	toBacklogCards,
	type BacklogIssue
} from './backlog';

describe('toBacklogCards availability', () => {
	it('maps a plain issue to Ready', () => {
		const card = toBacklogCard(backlogIssuePlain);
		expect(card.availability).toEqual({
			kind: 'ready',
			badge: { signal: 'standby', label: 'Ready' }
		});
		expect(card).toMatchObject({
			id: 'issue_30',
			displayRef: 'dpaez/factory-dashboard#30',
			title: 'Dark mode contrast pass',
			url: 'https://github.com/dpaez/factory-dashboard/issues/30',
			labels: ['enhancement'],
			blockers: [],
			children: []
		});
	});

	it('maps a blocked issue to Blocked with both blocker links, the url-less one included', () => {
		const card = toBacklogCard(backlogBlockedIssue);
		expect(card.availability).toEqual({
			kind: 'blocked',
			badge: { signal: 'wait', label: 'Blocked' }
		});
		expect(card.blockers).toEqual([
			{
				displayRef: 'dpaez/factory-dashboard#21',
				title: 'Switch routes to the factory API',
				url: 'https://github.com/dpaez/factory-dashboard/issues/21'
			},
			{ displayRef: 'KAI-7', title: 'Tracker auth', url: null }
		]);
	});

	it('maps an umbrella issue to Umbrella with its children', () => {
		const card = toBacklogCard(backlogUmbrellaIssue);
		expect(card.availability.kind).toBe('umbrella');
		expect(card.availability.badge).toEqual({ signal: 'standby', label: 'Umbrella' });
		expect(card.children.map((child) => child.displayRef)).toEqual([
			'dpaez/factory-dashboard#17',
			'dpaez/factory-dashboard#21'
		]);
	});

	it('keeps an umbrella with no listed children an Umbrella', () => {
		const card = toBacklogCard(backlogUmbrellaNoChildren);
		expect(card.availability.kind).toBe('umbrella');
		expect(card.children).toEqual([]);
	});

	it('lets Umbrella win over Blocked and keeps the blockers', () => {
		const card = toBacklogCard(backlogBlockedUmbrella);
		expect(card.availability.kind).toBe('umbrella');
		expect(card.blockers.map((link) => link.displayRef)).toEqual(['dpaez/factory-dashboard#22']);
		expect(card.children.map((link) => link.displayRef)).toEqual(['dpaez/factory-dashboard#42']);
	});

	it('keeps tracker order', () => {
		expect(toBacklogCards(backlogIssues).map((card) => card.id)).toEqual(
			backlogIssues.map((issue) => issue.id)
		);
	});

	it('does not share arrays with the input', () => {
		const card = toBacklogCard(backlogBlockedIssue);
		expect(card.blockers).not.toBe(backlogBlockedIssue.blockedBy);
		expect(card.labels).not.toBe(backlogBlockedIssue.labels);
	});
});

describe('planned fields', () => {
	it('are null for API-shaped issues', () => {
		for (const issue of [backlogIssuePlain, backlogIssueBare, backlogBlockedIssue]) {
			expect(toBacklogCard(issue)).toMatchObject({
				author: null,
				createdAt: null,
				updatedAt: null,
				description: null
			});
		}
	});

	it('are populated for the planned-field fixture', () => {
		const card = toBacklogCard(backlogIssueWithDetails);
		expect(card.author).toBe('dpaez');
		expect(card.createdAt).toBe('2026-10-01T09:30:00Z');
		expect(card.updatedAt).toBe('2026-10-12T16:45:00Z');
		expect(card.description).toContain('## Why');
	});

	it('read empty, blank or non-string values as null', () => {
		const odd = {
			...backlogIssuePlain,
			author: '',
			createdAt: '   ',
			updatedAt: null,
			description: 42
		} as unknown as BacklogIssue;
		expect(toBacklogCard(odd)).toMatchObject({
			author: null,
			createdAt: null,
			updatedAt: null,
			description: null
		});
	});
});

describe('readyToStart', () => {
	it('counts only issues that are neither blocked nor umbrella', () => {
		// plain, with details, bare, many labels.
		expect(readyToStart(backlogIssues)).toBe(4);
		expect(readyToStart([backlogBlockedIssue, backlogUmbrellaIssue, backlogBlockedUmbrella])).toBe(
			0
		);
		expect(readyToStart([])).toBe(0);
	});

	it('ignores any label filter applied to the cards', () => {
		const filtered = filterByLabel(toBacklogCards(backlogIssues), 'epic');
		expect(filtered.every((card) => card.availability.kind === 'umbrella')).toBe(true);
		expect(readyToStart(backlogIssues)).toBe(4);
	});
});

describe('backlogLabels and filterByLabel', () => {
	it('returns the sorted unique labels present', () => {
		const labels = backlogLabels([
			backlogIssuePlain,
			backlogUmbrellaIssue,
			backlogBlockedIssue,
			backlogIssueWithDetails,
			backlogBlockedUmbrella
		]);
		expect(labels).toEqual(['enhancement', 'epic', 'ui']);
	});

	it('includes every label of the many-label issue once', () => {
		const labels = backlogLabels(backlogIssues);
		expect(new Set(labels).size).toBe(labels.length);
		for (const label of backlogIssueManyLabels.labels) expect(labels).toContain(label);
		expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
	});

	it('returns no labels for an empty backlog', () => {
		expect(backlogLabels([])).toEqual([]);
	});

	it('keeps only cards carrying the label, and every card for null', () => {
		const cards = toBacklogCards(backlogIssues);
		expect(filterByLabel(cards, 'ui').map((card) => card.id)).toEqual([
			'issue_31',
			'issue_33',
			'issue_41'
		]);
		expect(filterByLabel(cards, null)).toEqual(cards);
		expect(filterByLabel(cards, 'no-such-label')).toEqual([]);
	});
});
