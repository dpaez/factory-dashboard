<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import TicketInspector from './ticket-inspector.svelte';
	import { toTicketDetail } from '$lib/factory/adapters';
	import type { components } from '$lib/factory/generated/factory-api';
	import type { InspectorState, InspectorTab } from '$lib/factory/inspector';
	import {
		executionList,
		runPage,
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

	const panelText = (pane: HTMLElement) => within(pane).getByRole('tabpanel').textContent ?? '';

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
						'The Inspector for one ticket execution, the same on the Flow board and on the ticket page. It shows the header and Source, open and answered attention requests, then the Tasks, Activity, Evidence and Usage tabs. Activity and Evidence are placeholders for now. The tab follows the `tab` prop, and choosing one calls `ontabchange`; the Inspector never navigates by itself. It also has loading, not-found and error states. `onclose` adds Close (board), `openHref` adds "Open ticket", and `onretry` adds Retry to a retryable error.'
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
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Paused');
		await expect(pane.querySelector('[data-slot="inspector-attention"]')).toBeNull();
	}}
/>

<Story
	name="Failed"
	args={base(loaded(single(ticketDetailFailed)))}
	play={async ({ canvasElement }) => {
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
		await expect(panelText(pane)).toContain('Activity is not available yet.');
		await expect(pane.querySelector('[data-testid="latest-activity"]')).toHaveTextContent(
			'Running pnpm test…'
		);
	}}
/>

<Story
	name="Evidence tab"
	args={base(running, 'evidence')}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(panelText(pane)).toContain('Evidence is not available yet.');
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
		await waitFor(() =>
			expect(pane.getByRole('tabpanel')).toHaveTextContent('Activity is not available yet.')
		);
		await userEvent.keyboard('{ArrowRight}');
		await waitFor(() =>
			expect(pane.getByRole('tabpanel')).toHaveTextContent('Evidence is not available yet.')
		);
	}}
>
	{#snippet template()}
		<TicketInspector
			state={running}
			tab={controlledTab}
			ontabchange={(next) => (controlledTab = next)}
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
