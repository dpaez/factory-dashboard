<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import TicketInspector from './ticket-inspector.svelte';
	import { toRunDetail, toTicketDetail } from '$lib/factory/adapters';
	import type { components } from '$lib/factory/generated/factory-api';
	import type {
		InspectorState,
		InspectorTab,
		RunDetailSource,
		RunDetailViewState
	} from '$lib/factory/inspector';
	import {
		executionList,
		runHistoryReviewChanges,
		runHistoryWorkCrashed,
		runHistoryWorkInitial,
		runPage,
		runPageHistory,
		runPageFirstExecution,
		runWrapupPrepared,
		ticketDetailActiveInWork,
		ticketDetailAgentQuestion,
		ticketDetailCancelled,
		ticketDetailComplete,
		ticketDetailFailed,
		ticketDetailMultiExecution,
		ticketDetailMultiExecutionFirst,
		ticketDetailPaused,
		ticketDetailPlanning,
		ticketDetailReadyForHandoff
	} from '$lib/factory/fixtures';

	type Schemas = components['schemas'];

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	/** A ticket with one execution, its current one. */
	const single = (detail: Schemas['TicketDetail'], runs: Schemas['Run'][] = []) =>
		toTicketDetail({
			detail,
			executions: {
				items: [
					{
						createdAt: detail.createdAt,
						current: true,
						finishedAt: detail.finishedAt,
						generation: detail.execution,
						stage: detail.stage,
						status: detail.status,
						statusReason: detail.statusReason
					}
				]
			} satisfies Schemas['ExecutionList'],
			runs
		});

	const loaded = (detail: ReturnType<typeof single>, runsComplete = true): InspectorState => ({
		kind: 'loaded',
		detail,
		runsComplete
	});

	const base = (state: InspectorState, tab: InspectorTab = 'tasks') => ({
		state,
		tab,
		ontabchange: fn(),
		hrefForExecution: (n: number) => `#execution-${n}`
	});

	const running = loaded(single(ticketDetailActiveInWork, runPage.items));
	const rerunCurrent = loaded(
		toTicketDetail({ detail: ticketDetailMultiExecution, executions: executionList, runs: [] })
	);
	const rerunPast = loaded(
		toTicketDetail({
			detail: ticketDetailMultiExecutionFirst,
			executions: executionList,
			runs: runPageFirstExecution.items
		})
	);
	// The contract types usage as required; a factory that sends none must
	// still read as Unavailable, never $0.00.
	const nullUsage = loaded({
		...single(ticketDetailActiveInWork, [runWrapupPrepared]),
		usage: null
	});

	/**
	 * DESIGN.md, in both panes: no Beacon Yellow surface outside the lifecycle locator, and
	 * every status badge takes one of the five signal tones.
	 */
	const expectSignalTones = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const panes = canvasElement.querySelectorAll<HTMLElement>('[data-theme-pane]');
		await expect(panes).toHaveLength(2);
		for (const pane of panes) {
			const root = pane.querySelector<HTMLElement>('[data-testid="ticket-inspector"]')!;
			const probe = (cls: string) => {
				const element = document.createElement('span');
				element.className = cls;
				root.append(element);
				const color = getComputedStyle(element).backgroundColor;
				element.remove();
				return color;
			};
			const beacon = probe('bg-primary');
			const tones = ['run', 'wait', 'standby', 'fault', 'clear'].map((t) =>
				probe(`bg-signal-${t}`)
			);
			const surfaces = [...root.querySelectorAll<HTMLElement>('*')].filter(
				(element) =>
					!element.closest('[data-testid="timeline"]') &&
					getComputedStyle(element).backgroundColor === beacon
			);
			await expect(surfaces).toEqual([]);
			for (const badge of root.querySelectorAll('[data-slot="status-badge"]')) {
				await expect(tones).toContain(getComputedStyle(badge).backgroundColor);
			}
		}
	};

	const panelText = (pane: HTMLElement) => within(pane).getByRole('tabpanel').textContent ?? '';

	/**
	 * A fetch-free run detail source: every history run loaded, except the ids
	 * given an explicit state. `load` and `retry` are spies.
	 */
	const staticRuns = (overrides: Record<string, RunDetailViewState> = {}): RunDetailSource => {
		const views = new Map<string, RunDetailViewState>(
			runPageHistory.items.map((item) => [item.id, { kind: 'loaded', run: toRunDetail(item) }])
		);
		Object.entries(overrides).forEach(([id, value]) => views.set(id, value));
		return {
			view: (_execution, id) => views.get(id) ?? { kind: 'loading' },
			load: fn(),
			retry: fn()
		};
	};

	const history = loaded(single(ticketDetailActiveInWork, runPageHistory.items));
	const noRuns = loaded(single(ticketDetailActiveInWork, []));
	const latestId = runPageHistory.items.reduce((a, b) => (b.sequence > a.sequence ? b : a)).id;
	const withRuns = (
		state: InspectorState,
		tab: InspectorTab,
		run: string | null = null,
		source: RunDetailSource = staticRuns()
	) => ({ ...base(state, tab), run, onrunchange: fn(), runDetail: source });

	const { Story } = defineMeta({
		title: 'Components/Factory/TicketInspector',
		component: TicketInspector,
		parameters: {
			a11y: {
				test: 'error',
				// Side by side renders the Inspector twice (light and dark), so its
				// region landmark repeats; a page shows one Inspector.
				config: { rules: [{ id: 'landmark-unique', enabled: false }] }
			},
			docs: {
				description: {
					component:
						'The Inspector for one ticket execution, the same on the Flow board and on the ticket page. It shows the header and Source, open and answered attention requests, then the Tasks, Activity, Evidence and Usage tabs. Activity shows the latest activity and the run timeline (with the selected run\'s evidence below it); Evidence shows the selected run, or the latest run. The selected run follows `run`, choosing one calls `onrunchange`, and run detail comes from `runDetail`, read only when Activity has a selection or Evidence is shown. A run read failure stays inside its panel. The tab follows the `tab` prop, and choosing one calls `ontabchange`; the Inspector never navigates by itself. It also has loading, not-found and error states. `onclose` adds Close (board), `openHref` adds "Open ticket", and `onretry` adds Retry to a retryable error.'
				}
			}
		}
	});
</script>

<script lang="ts">
	let controlledTab = $state<InspectorTab>('tasks');
</script>

<Story
	name="Running"
	args={base(running)}
	play={async ({ canvasElement }) => {
		await expectSignalTones({ canvasElement });
		const pane = firstPane(canvasElement);
		const root = pane.querySelector<HTMLElement>('[data-testid="ticket-inspector"]')!;
		await expect(root.tagName).toBe('SECTION');
		await expect(root).toHaveAttribute('data-ticket-key', ticketDetailActiveInWork.key);
		await expect(root).toHaveAttribute('data-execution', '1');
		await expect(root).toHaveAccessibleName(ticketDetailActiveInWork.title);
		const tabs = within(pane).getAllByRole('tab');
		await expect(tabs.map((t) => t.textContent?.trim())).toEqual([
			'Tasks',
			'Activity',
			'Evidence',
			'Usage'
		]);
		await expect(within(pane).getByRole('tab', { name: 'Tasks' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(pane.querySelectorAll('[data-testid="tasks"] [data-task]').length).toBe(
			ticketDetailActiveInWork.tasks.length
		);
		// Beacon Yellow only fills the lifecycle locator's progress, never a surface.
		const beacon = [...root.querySelectorAll('[class*="bg-primary"]')].filter(
			(element) => !element.closest('[data-testid="timeline"]')
		);
		await expect(beacon).toEqual([]);
		// No Close or Open ticket without their props (the ticket page placement).
		await expect(pane.querySelector('button[aria-label="Close inspector"]')).toBeNull();
		await expect(within(pane).queryByRole('link', { name: 'Open ticket' })).toBeNull();
	}}
/>

<Story
	name="Waiting with question"
	args={base(loaded(single(ticketDetailAgentQuestion)))}
	play={async ({ canvasElement }) => {
		await expectSignalTones({ canvasElement });
		const pane = firstPane(canvasElement);
		const attention = pane.querySelector('[data-slot="inspector-attention"]')!;
		await expect(attention).toHaveTextContent(ticketDetailAgentQuestion.attention[0]!.question);
		await expect(
			[...pane.querySelectorAll('[data-testid="ticket-inspector"] [class*="bg-primary"]')].filter(
				(element) => !element.closest('[data-testid="timeline"]')
			)
		).toEqual([]);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
			'data-signal',
			'wait'
		);
		// Attention comes before the tabs.
		const tabs = pane.querySelector('[data-testid="inspector-tabs"]')!;
		await expect(
			attention.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	}}
/>

<Story
	name="Paused"
	args={base(loaded(single(ticketDetailPaused)))}
	play={async ({ canvasElement }) => {
		await expectSignalTones({ canvasElement });
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Paused');
		await expect(pane.querySelector('[data-slot="inspector-attention"]')).toBeNull();
	}}
/>

<Story
	name="Failed"
	args={base(loaded(single(ticketDetailFailed)))}
	play={async ({ canvasElement }) => {
		await expectSignalTones({ canvasElement });
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
			'data-signal',
			'fault'
		);
	}}
/>

<Story
	name="Ready for handoff"
	args={base(loaded(single(ticketDetailReadyForHandoff)))}
	play={async ({ canvasElement }) => {
		await expectSignalTones({ canvasElement });
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveTextContent(
			'Ready for handoff'
		);
		await expect(pane.querySelector('[data-testid="tasks-progress"]')).toHaveTextContent(
			`${ticketDetailReadyForHandoff.progress.done}/${ticketDetailReadyForHandoff.progress.total} tasks done`
		);
	}}
/>

<Story
	name="Complete"
	args={base(loaded(single(ticketDetailComplete)))}
	play={async ({ canvasElement }) => {
		await expectSignalTones({ canvasElement });
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
			'data-signal',
			'clear'
		);
	}}
/>

<Story
	name="Cancelled"
	args={base(loaded(single(ticketDetailCancelled)))}
	play={async ({ canvasElement }) => {
		await expectSignalTones({ canvasElement });
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Cancelled');
	}}
/>

<Story
	name="Rerun, current execution"
	args={base(rerunCurrent)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="ticket-inspector"]')).toHaveAttribute(
			'data-execution',
			'2'
		);
		await expect(pane.querySelector('[data-testid="past-execution"]')).toBeNull();
		const rows = pane.querySelectorAll('[data-testid="executions"] [data-execution]');
		await expect(rows).toHaveLength(2);
		await expect(rows[0]!.querySelector('a')).toHaveAttribute('href', '#execution-1');
	}}
/>

<Story
	name="Rerun, past execution"
	args={base(rerunPast)}
	play={async ({ canvasElement }) => {
		await expectSignalTones({ canvasElement });
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="ticket-inspector"]')).toHaveAttribute(
			'data-execution',
			'1'
		);
		const banner = pane.querySelector('[data-testid="past-execution"]')!;
		await expect(banner).toHaveTextContent('Past execution 1, read-only.');
		await expect(banner.querySelector('a')).toHaveAttribute('href', '#execution-2');
	}}
/>

<Story
	name="No tasks (planning)"
	args={base(loaded(single(ticketDetailPlanning)))}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="tasks-empty"]')).toHaveTextContent(
			'Planning — tasks appear when the plan is ready.'
		);
	}}
/>

<Story
	name="Null usage"
	args={base(nullUsage, 'usage')}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByRole('tab', { name: 'Usage' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(pane.querySelector('[data-testid="usage-total"]')).toHaveTextContent(
			'Execution 1 total — (Unavailable)'
		);
		await expect(pane).not.toHaveTextContent('$0.00');
	}}
/>

<Story
	name="Tasks tab"
	args={base(running, 'tasks')}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByRole('tabpanel')).toContainElement(
			pane.querySelector('[data-testid="tasks"]')
		);
	}}
/>

<Story
	name="Activity tab"
	args={base(running, 'activity')}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(panelText(pane)).not.toContain('not available yet');
		await expect(pane.querySelector('[data-testid="latest-activity"]')).toHaveTextContent(
			'Latest activity'
		);
		await expect(pane.querySelector('[data-testid="latest-activity"]')).toHaveTextContent(
			'Running pnpm test…'
		);
		await expect(pane.querySelector('[data-slot="run-timeline"]')).not.toBeNull();
	}}
/>

<Story
	name="Activity, multi-task history"
	args={withRuns(history, 'activity')}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const latest = pane.querySelector('[data-testid="latest-activity"]')!;
		await expect(latest).toHaveTextContent('Latest activity');
		await expect(latest).toHaveTextContent('work · run 9');
		await expect(latest).toHaveTextContent('Running pnpm test…');
		await expect(
			[...pane.querySelectorAll('[data-run-group]')].map((g) => g.getAttribute('data-run-group'))
		).toEqual(['ticket', '01', '02']);
		// No selection: no evidence and no run read.
		await expect(pane.querySelector('[data-slot="evidence-panel"]')).toBeNull();
		await expect(args.runDetail!.load).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Activity, run selected"
	args={withRuns(history, 'activity', runHistoryReviewChanges.id)}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const row = pane.querySelector(`[data-run="${runHistoryReviewChanges.id}"]`)!;
		await expect(row).toHaveAttribute('aria-pressed', 'true');
		const panel = pane.querySelector('[data-slot="evidence-panel"]')!;
		await expect(panel).toHaveAttribute('data-state', 'loaded');
		await expect(panel.querySelectorAll('[data-finding]')).toHaveLength(3);
		await expect(args.runDetail!.load).toHaveBeenCalledWith(
			ticketDetailActiveInWork.execution,
			runHistoryReviewChanges.id
		);
	}}
/>

<Story
	name="Activity, selecting a run reports it"
	args={withRuns(history, 'activity')}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const row = pane.querySelector<HTMLButtonElement>(`[data-run="${runHistoryWorkInitial.id}"]`)!;
		await userEvent.click(row);
		await expect(args.onrunchange).toHaveBeenCalledOnce();
		await expect(args.onrunchange).toHaveBeenCalledWith(runHistoryWorkInitial.id);
		// A repeated press before `run` catches up reports nothing.
		await userEvent.click(row);
		await expect(args.onrunchange).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Evidence tab"
	args={withRuns(history, 'evidence')}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(panelText(pane)).not.toContain('not available yet');
		await expect(pane.querySelector('[data-testid="evidence-caption"]')).toHaveTextContent(
			'Latest run'
		);
		await expect(args.runDetail!.load).toHaveBeenCalledWith(
			ticketDetailActiveInWork.execution,
			latestId
		);
	}}
/>

<Story
	name="Evidence, validation failed"
	args={withRuns(history, 'evidence', runHistoryWorkInitial.id)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="evidence-caption"]')).toBeNull();
		const validation = pane.querySelector('[data-testid="evidence-validation"]')!;
		await expect(validation).toHaveTextContent('Failed');
		await expect(validation.querySelectorAll('[data-check]')).toHaveLength(4);
		await expect(validation.querySelector('[data-check="test"]')).toHaveTextContent('pnpm test');
	}}
/>

<Story
	name="Evidence, review changes requested"
	args={withRuns(history, 'evidence', runHistoryReviewChanges.id)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const review = pane.querySelector('[data-testid="evidence-review"]')!;
		await expect(review).toHaveTextContent('Changes requested');
		const finding = review.querySelector('[data-finding="R1-01"]')!;
		await expect(finding).toHaveTextContent('1. R1-01');
		await expect(finding).toHaveTextContent('Critical');
		await expect(finding.querySelector('[data-testid="finding-location"]')).toHaveTextContent(
			'src/lib/server/factory/client.ts:12'
		);
		await expect(pane.querySelectorAll('[data-slot="evidence-panel"] a')).toHaveLength(0);
	}}
/>

<Story
	name="Evidence, run with no usage"
	args={withRuns(history, 'evidence', runHistoryWorkCrashed.id)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="evidence-usage"]')).toHaveTextContent(
			'Usage unavailable'
		);
		await expect(pane.querySelector('[data-slot="evidence-panel"]')).not.toHaveTextContent('$0.00');
	}}
/>

<Story
	name="Evidence, run detail error"
	args={withRuns(
		history,
		'evidence',
		runHistoryWorkInitial.id,
		staticRuns({
			[runHistoryWorkInitial.id]: {
				kind: 'error',
				title: 'The factory is unavailable',
				retryable: true
			}
		})
	)}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const panel = pane.querySelector('[data-slot="evidence-panel"]')!;
		await expect(panel).toHaveAttribute('data-state', 'error');
		// The header and tabs keep rendering around the failed panel.
		await expect(pane.querySelector('[data-testid="ticket-inspector"]')).toHaveAttribute(
			'data-state',
			'loaded'
		);
		await expect(pane.querySelector('[data-slot="ticket-header"]')).not.toBeNull();
		await expect(within(pane).getAllByRole('tab')).toHaveLength(4);
		const retry = within(panel as HTMLElement).getByRole('button', { name: 'Retry' });
		await expect(retry.className).toContain('bg-secondary');
		await userEvent.click(retry);
		await expect(args.runDetail!.retry).toHaveBeenCalledWith(
			ticketDetailActiveInWork.execution,
			runHistoryWorkInitial.id
		);
	}}
/>

<Story
	name="Evidence, no runs"
	args={withRuns(noRuns, 'evidence')}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="evidence-empty"]')).toHaveTextContent(
			'No runs yet for this execution.'
		);
		await expect(args.runDetail!.load).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Evidence, run not in this execution"
	args={withRuns(history, 'evidence', 'run_elsewhere')}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="run-unknown"]')).toHaveTextContent(
			'Run run_elsewhere is not in this execution'
		);
		await expect(pane.querySelector('[data-slot="evidence-panel"]')).toBeNull();
		await expect(args.runDetail!.load).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Usage tab reads no run"
	args={withRuns(history, 'usage', runHistoryWorkInitial.id)}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="usage-total"]')).not.toBeNull();
		await expect(args.runDetail!.load).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Usage tab"
	args={base(running, 'usage')}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="usage-total"]')).toHaveTextContent(
			'Execution 1 total $3.42'
		);
		await expect(pane.querySelectorAll('[data-run]').length).toBe(runPage.items.length);
	}}
/>

<Story
	name="Tab keys report the tab"
	args={base(running, 'tasks')}
	play={async ({ args, canvasElement }) => {
		const pane = within(firstPane(canvasElement));
		const tasks = pane.getByRole('tab', { name: 'Tasks' });
		const calls = args.ontabchange as unknown as { mock: { calls: unknown[][] } };
		const since = (start: number) => calls.mock.calls.slice(start);
		// Each choice reports exactly once, though `tab` stays 'tasks'.
		let start = calls.mock.calls.length;
		tasks.focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect(since(start)).toEqual([['activity']]);
		start = calls.mock.calls.length;
		await userEvent.click(pane.getByRole('tab', { name: 'Usage' }));
		await expect(since(start)).toEqual([['usage']]);
		// Choosing the same tab again while the parent has not caught up reports nothing.
		start = calls.mock.calls.length;
		await userEvent.click(pane.getByRole('tab', { name: 'Usage' }));
		await expect(since(start)).toEqual([]);
		// The tab is controlled: with `tab` unchanged, Tasks stays shown.
		await waitFor(() =>
			expect(pane.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true')
		);
	}}
/>

<Story
	name="Panel follows the tab prop"
	play={async ({ canvasElement }) => {
		const pane = within(firstPane(canvasElement));
		pane.getByRole('tab', { name: 'Tasks' }).focus();
		await userEvent.keyboard('{ArrowRight}');
		await waitFor(() => expect(pane.getByRole('tabpanel')).toHaveTextContent('Latest activity'));
		await userEvent.keyboard('{ArrowRight}');
		await waitFor(() =>
			expect(
				pane
					.getByRole('tabpanel')
					.querySelector(
						'[data-testid="evidence-empty"], [data-slot="evidence-panel"], [data-testid="run-unknown"]'
					)
			).not.toBeNull()
		);
	}}
>
	{#snippet template()}
		<TicketInspector
			state={running}
			tab={controlledTab}
			ontabchange={(next) => (controlledTab = next)}
			runDetail={staticRuns()}
			hrefForExecution={(n) => `#execution-${n}`}
		/>
	{/snippet}
</Story>

<Story
	name="With Close (board)"
	args={{ ...base(running), onclose: fn(), openHref: '#ticket-page' }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByRole('link', { name: 'Open ticket' })).toHaveAttribute(
			'href',
			'#ticket-page'
		);
		const close = pane.querySelector<HTMLButtonElement>('button[aria-label="Close inspector"]')!;
		await userEvent.click(close);
		await expect(args.onclose).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Without Close (page)"
	args={base(running)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('button[aria-label="Close inspector"]')).toBeNull();
	}}
/>

<Story
	name="Loading"
	args={{ ...base({ kind: 'loading', key: ticketDetailActiveInWork.key }), onclose: fn() }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const root = pane.querySelector('[data-testid="ticket-inspector"]')!;
		await expect(root).toHaveAttribute('aria-busy', 'true');
		await expect(root).toHaveAccessibleName('Loading ticket…');
		await expect(pane.querySelector('[role="tablist"]')).toBeNull();
	}}
/>

<Story
	name="Not found"
	args={base({ kind: 'not_found', key: 'acme-widgets-404-deadbeef' })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const root = pane.querySelector('[data-testid="ticket-inspector"]')!;
		await expect(root).toHaveAccessibleName('No such ticket');
		await expect(root).toHaveAttribute('data-ticket-key', 'acme-widgets-404-deadbeef');
		await expect(pane.querySelector('[data-testid="not-found-key"]')).toHaveTextContent(
			'acme-widgets-404-deadbeef'
		);
	}}
/>

<Story
	name="No such execution"
	args={base({ kind: 'not_found', key: ticketDetailMultiExecution.key, execution: 9 })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="ticket-inspector"]')).toHaveAccessibleName(
			'No such execution'
		);
		await expect(pane.querySelector('[data-testid="not-found-key"]')).toHaveTextContent(
			'Execution 9'
		);
	}}
/>

<Story
	name="Error"
	args={{
		...base({ kind: 'error', title: 'The factory is unavailable', retryable: true }),
		onretry: fn()
	}}
	play={async ({ args, canvasElement }) => {
		await expectSignalTones({ canvasElement });
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="ticket-inspector"]')).toHaveAccessibleName(
			'The factory is unavailable'
		);
		const retry = within(pane).getByRole('button', { name: 'Retry' });
		// Secondary, not a Beacon primary action.
		await expect(retry.className).toContain('bg-secondary');
		await expect(retry.className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
		await userEvent.click(retry);
		await expect(args.onretry).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Error, not retryable"
	args={{
		...base({ kind: 'error', title: 'The factory configuration is invalid', retryable: false }),
		onretry: fn()
	}}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).queryByRole('button', { name: 'Retry' })).toBeNull();
	}}
/>
