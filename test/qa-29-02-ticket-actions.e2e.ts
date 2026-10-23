import { expect, test, type Locator, type Page } from '@playwright/test';

import { ticketDetailPaused } from '../src/lib/factory/fixtures/tickets.ts';
import { runsTwoActive } from '../src/lib/factory/fixtures/runs.ts';

// QA for ticket #29, task 02: TicketActions and CancelExecutionDialog in Storybook.
test.describe.configure({ retries: 1 });
const SB = 'http://localhost:6006';
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const BAR = 'components-factory-ticketactions';
type Theme = 'side-by-side' | 'light' | 'dark';

type Preview = {
	__STORYBOOK_PREVIEW__?: {
		currentRender?: { phase?: string };
		storyStoreValue: {
			loadStory: (o: { storyId: string }) => Promise<{ initialArgs: Record<string, unknown> }>;
		};
	};
	__STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
	__calls: unknown[][];
};

/** Open a story, wait for its play function to finish, and return its panes. */
const open = async (page: Page, slug: string, theme: Theme = 'side-by-side') => {
	for (let attempt = 0; ; attempt++) {
		try {
			await page.goto(`${SB}/iframe.html?id=${BAR}--${slug}&viewMode=story&globals=theme:${theme}`);
			break;
		} catch (e) {
			if (attempt >= 2 || !String(e).includes('ERR_ABORTED')) throw e;
		}
	}
	await expect
		.poll(
			() =>
				page
					.evaluate(
						() => (window as unknown as Preview).__STORYBOOK_PREVIEW__?.currentRender?.phase
					)
					.catch(() => undefined),
			{ timeout: 30_000 }
		)
		.toBe('finished');
	return page.locator('#storybook-root [data-theme-pane]');
};

/** Replace story args; callback names in `record` become recorders into window.__calls. */
const update = (page: Page, slug: string, record: string[], args: Record<string, unknown> = {}) =>
	page.evaluate(
		([sid, list, extra]) => {
			const w = window as unknown as Preview;
			w.__calls = [];
			const recorders = Object.fromEntries(
				list.map((n) => [n, (...a: unknown[]) => w.__calls.push([n, ...a])])
			);
			w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
				storyId: sid,
				updatedArgs: { ...extra, ...recorders }
			});
		},
		[`${BAR}--${slug}`, record, args] as const
	);
const calls = async (page: Page) => {
	const list = await page.evaluate(() => (window as unknown as Preview).__calls);
	// A dev-server reload (parallel build-storybook) drops the recorders: fail, and retry.
	if (!list) throw new Error('the story reloaded and lost its recorders');
	return list;
};

const LABELS = {
	stop: 'Stop agent',
	retry: 'Retry',
	cancel: 'Cancel execution',
	complete: 'Mark complete',
	rerun: 'Rerun'
} as const;
type Action = keyof typeof LABELS;
const button = (scope: Locator | Page, action: Action) =>
	scope.getByRole('button', { name: LABELS[action], exact: true });

type Expected = Partial<Record<Action, 'enabled' | { disabled: string }>>;
const STATUSES: [string, Expected][] = [
	['queued', { cancel: 'enabled' }],
	['active-one-run', { stop: 'enabled', cancel: 'enabled' }],
	['waiting-for-user', { cancel: 'enabled' }],
	[
		'waiting-in-wrapup',
		{ cancel: 'enabled', complete: { disabled: 'Wrapup is still preparing the handoff.' } }
	],
	['paused', { retry: 'enabled', cancel: 'enabled' }],
	['resuming', { cancel: 'enabled' }],
	['resume-failed', { retry: 'enabled', cancel: 'enabled' }],
	['failed', { retry: 'enabled', cancel: 'enabled', rerun: 'enabled' }],
	['ready-for-handoff', { complete: 'enabled', cancel: 'enabled' }],
	['complete', { rerun: 'enabled' }],
	['cancelled', { rerun: 'enabled' }],
	['past-execution', {}]
];

test('AC1: each execution status shows enabled, disabled-with-reason and absent actions in light and dark', async ({
	page
}) => {
	test.setTimeout(180_000);
	for (const [slug, expected] of STATUSES) {
		const panes = await open(page, slug);
		await expect(panes).toHaveCount(2);
		await expect.soft(panes.nth(0)).toHaveAttribute('data-theme-pane', 'light');
		await expect.soft(panes.nth(1)).toHaveAttribute('data-theme-pane', 'dark');
		for (const i of [0, 1]) {
			const pane = panes.nth(i);
			for (const action of Object.keys(LABELS) as Action[]) {
				const state = expected[action];
				const control = button(pane, action);
				const where = `${slug} pane ${i} ${action}`;
				if (!state) {
					await expect.soft(control, where).toHaveCount(0);
				} else if (state === 'enabled') {
					await expect.soft(control, where).toBeEnabled();
				} else {
					await expect.soft(control, where).toBeDisabled();
					await expect.soft(pane.getByText(state.disabled), where).toBeVisible();
					await expect
						.soft(control, where)
						.toHaveAccessibleDescription(new RegExp(state.disabled.replace(/\./g, '\\.')));
				}
			}
		}
		await shot(page, `ac1-status-${slug}`);
	}
});

const PENDING: [Action, string, string][] = [
	['stop', 'stop-pending', 'Stop requested.'],
	['retry', 'retry-pending', 'Sending…'],
	['cancel', 'cancel-pending', 'Sending…'],
	['complete', 'mark-complete-pending', 'Accepted, waiting for the factory.'],
	['rerun', 'rerun-pending', 'Sending…']
];
const REJECTED: [Action, string][] = [
	['stop', 'stop-rejected'],
	['retry', 'retry-rejected'],
	['cancel', 'cancel-rejected'],
	['complete', 'mark-complete-rejected'],
	['rerun', 'rerun-rejected']
];

test('AC2: every action has a pending story and a rejected story with its explanation', async ({
	page
}) => {
	test.setTimeout(180_000);
	for (const [action, slug, label] of PENDING) {
		const pane = (await open(page, slug)).first();
		const control = button(pane, action);
		await expect.soft(control, slug).toBeDisabled();
		await expect.soft(pane.getByText(label, { exact: true }), slug).toBeVisible();
		await expect
			.soft(control, slug)
			.toHaveAccessibleDescription(new RegExp(label.replace('.', '\\.')));
		await shot(page, `ac2-${slug}`);
	}
	for (const [action, slug] of REJECTED) {
		const pane = (await open(page, slug)).first();
		const control = button(pane, action);
		const failure = pane.getByRole('status').filter({ hasText: /changed/i });
		await expect.soft(failure, slug).toBeVisible();
		const text = (await failure.textContent())?.trim() ?? '';
		expect.soft(text.length, slug).toBeGreaterThan(10);
		await expect.soft(control, slug).toBeEnabled();
		await expect.soft(control, slug).toHaveAccessibleDescription(new RegExp(text.slice(0, 20)));
		await shot(page, `ac2-${slug}`);
	}
});

const dialog = (page: Page) => page.getByRole('alertdialog');

test('AC3: dismissing the cancel dialog with Keep execution or Escape sends no command', async ({
	page
}) => {
	const pane = (await open(page, 'cancel-dismissed', 'light')).first();
	await update(page, 'cancel-dismissed', ['oncommand']);
	await button(pane, 'cancel').click();
	await expect(dialog(page)).toBeVisible();
	await shot(page, 'ac3-cancel-dialog-open');
	await dialog(page).getByRole('button', { name: 'Keep execution' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await button(pane, 'cancel').click();
	await expect(dialog(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog(page)).toHaveCount(0);
	expect(await calls(page)).toEqual([]);
});

test('AC4: confirming sends one cancel for the ticket; the dialog stays open and disabled while pending', async ({
	page
}) => {
	const pane = (await open(page, 'cancel-dismissed', 'light')).first();
	await update(page, 'cancel-dismissed', ['oncommand']);
	await button(pane, 'cancel').click();
	const box = page.getByRole('alertdialog', {
		name: `Cancel execution ${ticketDetailPaused.execution} of ${ticketDetailPaused.displayRef}?`
	});
	await expect(box).toBeVisible();
	await box.getByRole('button', { name: 'Cancel execution' }).click();
	await expect
		.poll(() => calls(page))
		.toEqual([['oncommand', { command: 'cancel', ticket: ticketDetailPaused.key }]]);
	await expect(box).toBeVisible();

	// The coordinator reports the cancel as pending: the dialog stays open, its action busy.
	await update(page, 'cancel-dismissed', ['oncommand'], {
		feedback: { cancel: { phase: 'accepted', explanation: 'Accepted, waiting for the factory.' } }
	});
	const action = box.getByRole('button', { name: 'Cancelling…' });
	await expect(action).toBeDisabled();
	await expect(action).toHaveAttribute('aria-busy', 'true');
	await action.click({ force: true });
	await expect(box).toBeVisible();
	expect(await calls(page)).toEqual([]);
	await shot(page, 'ac4-cancel-pending-dialog');
});

test('AC5: with several active runs Stop waits for a choice, then sends the chosen run id', async ({
	page
}) => {
	// The unchosen state, as the placement passes it before any choice.
	let pane = (await open(page, 'active-one-run')).first();
	const unchosen = await page.evaluate(async (id) => {
		const p = (window as unknown as Preview).__STORYBOOK_PREVIEW__!;
		return (await p.storyStoreValue.loadStory({ storyId: id })).initialArgs.state;
	}, `${BAR}--several-active-runs`);
	await update(page, 'active-one-run', ['oncommand'], { state: unchosen });
	await expect(pane.getByRole('radio')).toHaveCount(runsTwoActive.length);
	for (const radio of await pane.getByRole('radio').all()) await expect(radio).not.toBeChecked();
	await expect(button(pane, 'stop')).toBeDisabled();
	await expect(pane.getByText('Choose which run to stop.')).toBeVisible();
	await button(pane, 'stop').click({ force: true });
	expect(await calls(page)).toEqual([]);
	await shot(page, 'ac5-stop-choose-run');

	// The interactive story: choose a run, and Stop sends that run's id.
	pane = (await open(page, 'several-active-runs')).first();
	const target = runsTwoActive[0]!;
	await update(page, 'several-active-runs', ['oncommand']);
	await pane.getByRole('radio', { name: new RegExp(target.id) }).check();
	await expect(button(pane, 'stop')).toBeEnabled();
	await expect(button(pane, 'stop')).toHaveAccessibleDescription(new RegExp(target.id));
	await shot(page, 'ac5-stop-run-chosen');
	await button(pane, 'stop').click();
	await expect
		.poll(() => calls(page))
		.toEqual([['oncommand', { command: 'stop', run: target.id }]]);
});

test('AC6: read-only access disables every action and shows the access explanation once', async ({
	page
}) => {
	const panes = await open(page, 'read-only');
	await update(page, 'read-only', ['oncommand']);
	for (const i of [0, 1]) {
		const pane = panes.nth(i);
		const explanation = pane.getByText(
			"Action access required: this dashboard's token cannot send commands."
		);
		await expect(explanation).toHaveCount(1);
		await expect(explanation).toBeVisible();
		const buttons = pane.getByRole('button');
		await expect(buttons).not.toHaveCount(0);
		for (const b of await buttons.all()) {
			await expect.soft(b).toBeDisabled();
			await expect.soft(b).toHaveAccessibleDescription(/Action access required/);
		}
		for (const r of await pane.getByRole('radio').all()) await expect.soft(r).toBeDisabled();
	}
	await button(panes.first(), 'retry').click({ force: true });
	expect(await calls(page)).toEqual([]);
	await shot(page, 'ac6-read-only');
});

test('AC7: Mark complete, Rerun and Retry explain what they do and do not do', async ({ page }) => {
	let pane = (await open(page, 'ready-for-handoff')).first();
	await expect
		.soft(button(pane, 'complete'))
		.toHaveAccessibleDescription(/does not merge the pull request/);
	pane = (await open(page, 'complete')).first();
	await expect
		.soft(button(pane, 'rerun'))
		.toHaveAccessibleDescription(/Starts a new execution \(\d+\)/);
	await expect
		.soft(button(pane, 'rerun'))
		.toHaveAccessibleDescription(/Earlier executions stay readable/);
	pane = (await open(page, 'paused')).first();
	await expect
		.soft(button(pane, 'retry'))
		.toHaveAccessibleDescription(/It is not a new execution\./);
});
