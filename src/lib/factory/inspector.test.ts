import { describe, expect, it } from 'vitest';

import {
	INSPECTOR_TABS,
	inspectorHref,
	parseExecution,
	parseRun,
	parseTab,
	ticketPageHref
} from './inspector';

describe('parseTab', () => {
	it.each(INSPECTOR_TABS)('reads %s', (tab) => {
		expect(parseTab(tab)).toBe(tab);
	});

	it.each([[null], [undefined], [''], ['Usage'], ['runs'], ['constructor'], ['__proto__']])(
		'falls back to tasks for %s',
		(raw) => {
			expect(parseTab(raw)).toBe('tasks');
		}
	);
});

describe('parseExecution', () => {
	it('absent is the current execution', () => {
		expect(parseExecution(null)).toEqual({ valid: true, execution: undefined });
		expect(parseExecution(undefined)).toEqual({ valid: true, execution: undefined });
	});

	it.each([
		['1', 1],
		['2', 2],
		['42', 42]
	])('%s is execution %d', (raw, execution) => {
		expect(parseExecution(raw)).toEqual({ valid: true, execution });
	});

	it.each([
		['0'],
		['-1'],
		['1.5'],
		['abc'],
		[''],
		['01'],
		[' 1'],
		['1e3'],
		['99999999999999999999']
	])('%s is invalid', (raw) => {
		expect(parseExecution(raw)).toEqual({ valid: false });
	});
});

describe('inspectorHref', () => {
	const board = new URL('http://dashboard.test/?issue=7&ticket=old&execution=2&tab=usage&q=x');

	it('sets ticket, execution and tab, keeping unrelated parameters', () => {
		const href = inspectorHref(new URL('http://dashboard.test/?issue=7&q=x'), {
			ticket: 'k-1',
			execution: 1,
			tab: 'usage'
		});
		const url = new URL(href, 'http://dashboard.test');
		expect(url.pathname).toBe('/');
		expect(url.searchParams.get('issue')).toBe('7');
		expect(url.searchParams.get('q')).toBe('x');
		expect(url.searchParams.get('ticket')).toBe('k-1');
		expect(url.searchParams.get('execution')).toBe('1');
		expect(url.searchParams.get('tab')).toBe('usage');
	});

	it('clears with null and leaves undefined parameters alone', () => {
		const href = inspectorHref(board, { execution: null });
		const url = new URL(href, 'http://dashboard.test');
		expect(url.searchParams.has('execution')).toBe(false);
		expect(url.searchParams.get('ticket')).toBe('old');
		expect(url.searchParams.get('tab')).toBe('usage');
		expect(url.searchParams.get('issue')).toBe('7');
	});

	it('selecting another ticket can drop execution and tab', () => {
		const href = inspectorHref(board, { ticket: 'new', execution: null, tab: null });
		expect(href).toBe('/?issue=7&ticket=new&q=x');
	});

	it('omits the default tab', () => {
		const href = inspectorHref(board, { tab: 'tasks' });
		expect(new URL(href, 'http://dashboard.test').searchParams.has('tab')).toBe(false);
	});

	it('closing clears every inspector parameter', () => {
		expect(inspectorHref(board, { ticket: null, execution: null, tab: null })).toBe(
			'/?issue=7&q=x'
		);
		expect(inspectorHref(new URL('http://dashboard.test/?ticket=k'), { ticket: null })).toBe('/');
	});

	it('encodes the key', () => {
		const href = inspectorHref(new URL('http://dashboard.test/'), { ticket: 'a b&c=d/#1' });
		expect(href).toBe('/?ticket=a+b%26c%3Dd%2F%231');
		expect(new URL(href, 'http://dashboard.test').searchParams.get('ticket')).toBe('a b&c=d/#1');
	});

	it('keeps the path, such as the ticket page', () => {
		const page = new URL('http://dashboard.test/tickets/k-1?execution=1');
		expect(inspectorHref(page, { tab: 'usage' })).toBe('/tickets/k-1?execution=1&tab=usage');
	});
});

describe('parseRun', () => {
	it('is the id, opaque, when non-empty', () => {
		expect(parseRun('run_hist_01_work_initial')).toBe('run_hist_01_work_initial');
		expect(parseRun('a b/#1')).toBe('a b/#1');
	});

	it.each([[null], [undefined], ['']])('%s is no run', (raw) => {
		expect(parseRun(raw)).toBeNull();
	});
});

describe('inspectorHref with run', () => {
	const selected = new URL(
		'http://dashboard.test/?issue=7&ticket=old&execution=2&tab=evidence&run=run_a'
	);

	it('sets run, encoding it', () => {
		const href = inspectorHref(new URL('http://dashboard.test/?ticket=k'), { run: 'r/1 #2' });
		expect(new URL(href, 'http://dashboard.test').searchParams.get('run')).toBe('r/1 #2');
	});

	it('changing the tab keeps run', () => {
		expect(inspectorHref(selected, { tab: 'activity' })).toBe(
			'/?issue=7&ticket=old&execution=2&tab=activity&run=run_a'
		);
	});

	it('changing the execution lets the caller clear run', () => {
		expect(inspectorHref(selected, { execution: 1, run: null })).toBe(
			'/?issue=7&ticket=old&execution=1&tab=evidence'
		);
	});

	it('changing the ticket lets the caller clear run', () => {
		expect(inspectorHref(selected, { ticket: 'new', execution: null, run: null })).toBe(
			'/?issue=7&ticket=new&tab=evidence'
		);
	});

	it('an empty run clears it', () => {
		expect(new URL(inspectorHref(selected, { run: '' }), 'http://x').searchParams.has('run')).toBe(
			false
		);
	});

	it('closing clears run with the other parameters', () => {
		expect(inspectorHref(selected, { ticket: null, execution: null, tab: null, run: null })).toBe(
			'/?issue=7'
		);
	});
});

describe('ticketPageHref', () => {
	it('carries run, encoded', () => {
		expect(ticketPageHref('k', { tab: 'evidence', run: 'run a/1' })).toBe(
			'/tickets/k?tab=evidence&run=run+a%2F1'
		);
		expect(ticketPageHref('k', { run: null })).toBe('/tickets/k');
		expect(ticketPageHref('k', { run: '' })).toBe('/tickets/k');
	});

	it('is the current execution on the default tab by default', () => {
		expect(ticketPageHref('k-1')).toBe('/tickets/k-1');
	});

	it('carries execution and a non-default tab, encoding the key', () => {
		expect(ticketPageHref('a/b#1', { execution: 1, tab: 'usage' })).toBe(
			'/tickets/a%2Fb%231?execution=1&tab=usage'
		);
		expect(ticketPageHref('k', { execution: null, tab: 'tasks' })).toBe('/tickets/k');
	});
});
