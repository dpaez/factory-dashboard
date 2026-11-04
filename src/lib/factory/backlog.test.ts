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
	backlogUmbrellaNoChildren,
	problemNoTracker,
	problemTrackerCliMissing,
	problemTrackerForbidden,
	problemTrackerNotFound,
	problemTrackerUnauthorized,
	problemTrackerUnavailable,
	problemTrackerUnknown,
	problemUnauthorized
} from '$lib/factory/fixtures';

import {
	backlogLabels,
	codeSegments,
	describeBacklogFailure,
	filterByLabel,
	readableDetail,
	readyToStart,
	toBacklogCard,
	toBacklogCards,
	type BacklogFailure,
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

describe('describeBacklogFailure', () => {
	const asFailure = (problem: {
		type: string;
		title: string;
		detail?: string;
	}): BacklogFailure => ({
		type: problem.type,
		title: problem.title,
		...(problem.detail !== undefined && { detail: problem.detail }),
		retryable: true
	});
	const tracker = (detail: string) =>
		asFailure({ type: 'tracker_unavailable', title: 'Tracker unavailable', detail });

	it('reads a 401 / Bad credentials detail as rejected credentials, with the sbx action', () => {
		const view = describeBacklogFailure(asFailure(problemTrackerUnauthorized));
		expect(view.kind).toBe('unauthorized');
		expect(view.message).toBe('GitHub rejected the credentials the factory server uses.');
		expect(view.action).toContain("`gh api graphql -f query='{ viewer { login } }'`");
		expect(view.action).toContain('`sbx secret set github --sandbox <name> -t "$(gh auth token)"`');
		expect(view.action).toContain('`rm -rf ~/.cache/gh`');
		expect(view.action).toContain('`gh auth status` says "not logged in" in sbx');
		expect(view.reason).toBeNull();
		expect(describeBacklogFailure(tracker('HTTP 401: Bad credentials')).kind).toBe('unauthorized');
		expect(describeBacklogFailure(tracker('Bad credentials')).kind).toBe('unauthorized');
	});

	it('reads a 403 or rate limit as a refused request', () => {
		const view = describeBacklogFailure(asFailure(problemTrackerForbidden));
		expect(view.kind).toBe('forbidden');
		expect(view.message).toBe('GitHub refused the request (rate limit or missing scope).');
		expect(view.action).toBe(
			'The token needs `repo` read access. Try again later if rate limited.'
		);
		expect(describeBacklogFailure(tracker('HTTP 403: Resource not accessible')).kind).toBe(
			'forbidden'
		);
		expect(describeBacklogFailure(tracker('Secondary Rate Limit hit')).kind).toBe('forbidden');
	});

	it('reads a 404 or Could not resolve as a missing repository', () => {
		const view = describeBacklogFailure(asFailure(problemTrackerNotFound));
		expect(view.kind).toBe('not_found');
		expect(view.message).toBe("The tracker repository wasn't found.");
		expect(view.action).toBe('Check `tracker.owner` / `tracker.repo` in `.factory/FACTORY.json`.');
		expect(describeBacklogFailure(tracker('HTTP 404: Not Found')).kind).toBe('not_found');
	});

	it('reads gh: command not found or ENOENT as a missing CLI', () => {
		const view = describeBacklogFailure(asFailure(problemTrackerCliMissing));
		expect(view.kind).toBe('cli_missing');
		expect(view.message).toBe("The factory server can't find `gh`.");
		expect(view.action).toBe('Install the GitHub CLI where the server runs.');
		expect(describeBacklogFailure(tracker('sh: gh: command not found')).kind).toBe('cli_missing');
	});

	it('reads the no-tracker detail as no tracker configured', () => {
		const view = describeBacklogFailure(asFailure(problemNoTracker));
		expect(view).toMatchObject({
			kind: 'no_tracker',
			message: 'No tracker configured.',
			action: 'Add `tracker` to `.factory/FACTORY.json`.'
		});
	});

	it('keeps an unrecognized failure as Backlog unavailable with its detail', () => {
		const view = describeBacklogFailure(asFailure(problemTrackerUnknown));
		expect(view.kind).toBe('unknown');
		expect(view.message).toBe('Backlog unavailable.');
		expect(view.action).toBeNull();
		expect(view.reason).toBe(
			'Tracker unavailable. unexpected EOF while reading the GraphQL response'
		);
		expect(view.detail).toBe(problemTrackerUnknown.detail);
		expect(describeBacklogFailure(asFailure(problemTrackerUnavailable)).kind).toBe('unknown');
	});

	it('gives no detail to a failure without one', () => {
		const view = describeBacklogFailure({
			type: 'tracker_unavailable',
			title: 'Tracker unavailable',
			retryable: true
		});
		expect(view).toMatchObject({ kind: 'unknown', reason: 'Tracker unavailable.', detail: null });
	});

	it('applies precedence: no tracker and missing CLI never read as 401 or 404', () => {
		expect(
			describeBacklogFailure(
				tracker('FACTORY.json has no tracker, so there is no backlog. 401 404')
			).kind
		).toBe('no_tracker');
		expect(describeBacklogFailure(tracker('spawn gh ENOENT (exit 401, 404)')).kind).toBe(
			'cli_missing'
		);
		expect(describeBacklogFailure(tracker('HTTP 401 then 403 then 404')).kind).toBe('unauthorized');
		expect(describeBacklogFailure(tracker('HTTP 403 then 404')).kind).toBe('forbidden');
	});

	it('matches status codes as tokens, not inside longer numbers', () => {
		expect(describeBacklogFailure(tracker('request id 84012 failed')).kind).toBe('unknown');
		expect(describeBacklogFailure(tracker('took 4031ms')).kind).toBe('unknown');
	});

	it('only classifies tracker errors: a factory 401 is not a GitHub one', () => {
		const view = describeBacklogFailure(
			asFailure({ ...problemUnauthorized, detail: 'Bad credentials 401' })
		);
		expect(view.kind).toBe('unknown');
		expect(
			describeBacklogFailure({
				type: 'network_error',
				title: 'Backlog unreachable',
				detail: 'The dashboard did not answer the backlog request.',
				retryable: true
			})
		).toMatchObject({
			kind: 'unknown',
			reason: 'Backlog unreachable. The dashboard did not answer the backlog request.'
		});
	});
});

describe('readableDetail', () => {
	it('unescapes the Go-quoted 401 sample and pretty-prints its JSON body', () => {
		expect(readableDetail(problemTrackerUnauthorized.detail)).toBe(
			[
				'non-200 OK status code: 401 Unauthorized',
				'body:',
				'{',
				'  "message": "Bad credentials",',
				'  "documentation_url": "https://docs.github.com/rest",',
				'  "status": "401"',
				'}'
			].join('\n')
		);
	});

	it('pretty-prints an unquoted JSON body', () => {
		expect(readableDetail('HTTP 404 body: {"message":"Not Found"}')).toBe(
			'HTTP 404\nbody:\n{\n  "message": "Not Found"\n}'
		);
	});

	it('keeps escaped newlines, quotes and tabs inside JSON strings until the body is parsed', () => {
		const expected = (text: string) =>
			`HTTP 422\nbody:\n${JSON.stringify({ message: text }, null, 2)}`;
		const value = 'line one\nline "two"\tend';
		// An unquoted body: the escapes are the JSON's own.
		expect(readableDetail(`HTTP 422 body: ${JSON.stringify({ message: value })}`)).toBe(
			expected(value)
		);
		// A Go-quoted body: one level of quoting around the JSON's own escapes.
		const quoted = JSON.stringify(JSON.stringify({ message: value }));
		expect(readableDetail(`HTTP 422 body: ${quoted}`)).toBe(expected(value));
		expect(readableDetail(`HTTP 422 body: ${quoted}`)).toContain(
			'"message": "line one\\nline \\"two\\"\\tend"'
		);
	});

	it('leaves a malformed JSON body as is, unescaped', () => {
		const detail = 'HTTP 401 body: "{\\r\\n  \\"message\\": \\"Bad credentials\\",\\r\\n"';
		expect(readableDetail(detail)).toBe('HTTP 401 body: "{\n  "message": "Bad credentials",\n"');
	});

	it('returns a detail without escapes unchanged', () => {
		expect(readableDetail('GitHub did not answer.')).toBe('GitHub did not answer.');
		expect(readableDetail('body: not json')).toBe('body: not json');
	});
});

describe('codeSegments', () => {
	it('splits backticked spans into code segments', () => {
		expect(codeSegments('Add `tracker` to `.factory/FACTORY.json`.')).toEqual([
			{ text: 'Add ', code: false },
			{ text: 'tracker', code: true },
			{ text: ' to ', code: false },
			{ text: '.factory/FACTORY.json', code: true },
			{ text: '.', code: false }
		]);
	});
});
