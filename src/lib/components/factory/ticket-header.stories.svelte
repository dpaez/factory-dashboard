<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent } from 'storybook/test';
	import TicketHeader from './ticket-header.svelte';
	import { toTicketDetail } from '$lib/factory/adapters';
	import type { components } from '$lib/factory/generated/factory-api';
	import type { ExecutionView } from '$lib/factory/models';
	import {
		executionList,
		ticketDetailActiveInWork,
		ticketDetailAgentQuestion,
		ticketDetailCancelled,
		ticketDetailComplete,
		ticketDetailFailed,
		ticketDetailMultiExecution,
		ticketDetailMultiExecutionFirst,
		ticketDetailPaused,
		ticketDetailReadyForHandoff,
		ticketDetailTrackerWarnings,
		ticketUnknownStage
	} from '$lib/factory/fixtures';

	type Schemas = components['schemas'];

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	/** A ticket with one execution, its current one. */
	const single = (detail: Schemas['TicketDetail']) =>
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
			runs: []
		});

	const args = (detail: ReturnType<typeof single>) => ({
		header: detail.header,
		executions: detail.executions,
		hrefFor: (execution: ExecutionView) =>
			execution.current ? '#current' : `#execution-${execution.generation}`
	});

	const running = single(ticketDetailActiveInWork);
	const past = toTicketDetail({
		detail: ticketDetailMultiExecutionFirst,
		executions: executionList,
		runs: []
	});
	const rerun = toTicketDetail({
		detail: ticketDetailMultiExecution,
		executions: executionList,
		runs: []
	});
	const unknownStage = single({
		...ticketUnknownStage,
		attention: [],
		source: null,
		tasks: [],
		usage: ticketDetailActiveInWork.usage
	} satisfies Schemas['TicketDetail']);

	const { Story } = defineMeta({
		title: 'Components/Factory/TicketHeader',
		component: TicketHeader,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'The Inspector header: display reference, title, ticket key, execution and stage, the status badge and reason, the current task and round, the pull request, tracker warnings apart from failures, the lifecycle locator, the Source section and the execution history. Links come from `hrefFor`; `onclose` adds a Close control. Source labels, author, dates and description read "Unavailable" until the factory supplies them.'
				}
			}
		}
	});
</script>

<Story
	name="Running"
	args={args(running)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('h2')).toHaveTextContent(ticketDetailActiveInWork.title);
		await expect(pane.querySelector('[data-testid="ticket-key"]')).toHaveTextContent(
			ticketDetailActiveInWork.key
		);
		await expect(pane.querySelector('[data-testid="execution"]')).toHaveTextContent('Execution 1');
		await expect(pane.querySelector('[data-testid="stage"]')).toHaveTextContent('work');
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Active');
		await expect(pane.querySelector('[data-testid="current-task"]')).toHaveTextContent(
			'Typed read operations and API fixtures'
		);
		await expect(pane.querySelector('[data-testid="past-execution"]')).toBeNull();
		await expect(pane.querySelector('[data-testid="tracker-warnings"]')).toBeNull();
		await expect(pane.querySelector('button')).toBeNull();
	}}
/>

<Story
	name="Waiting with question"
	args={args(single(ticketDetailAgentQuestion))}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
			'data-signal',
			'wait'
		);
		await expect(pane.querySelector('[data-testid="status-reason"]')).toHaveTextContent(
			ticketDetailAgentQuestion.statusReason!
		);
	}}
/>

<Story
	name="Paused with round"
	args={args(single(ticketDetailPaused))}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Paused');
		await expect(pane.querySelector('[data-testid="status-reason"]')).toHaveTextContent(
			'Paused by the operator.'
		);
	}}
/>

<Story
	name="Failed"
	args={args(single(ticketDetailFailed))}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
			'data-signal',
			'fault'
		);
		await expect(pane.querySelector('[data-testid="status-reason"]')).toHaveTextContent(
			'Planning validation failed twice.'
		);
	}}
/>

<Story
	name="Ready for handoff"
	args={args(single(ticketDetailReadyForHandoff))}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const badge = pane.querySelector('[data-slot="status-badge"]')!;
		await expect(badge).toHaveTextContent('Ready for handoff');
		await expect(badge).toHaveAttribute('data-signal', 'wait');
		await expect(pane.querySelector('[data-testid="pull-request"]')).toHaveTextContent(
			'PR #42 · open'
		);
	}}
/>

<Story
	name="Complete"
	args={args(single(ticketDetailComplete))}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const badge = pane.querySelector('[data-slot="status-badge"]')!;
		await expect(badge).toHaveTextContent('Complete');
		await expect(badge).toHaveAttribute('data-signal', 'clear');
		await expect(pane.querySelector('[data-testid="pull-request"]')).toHaveTextContent(
			'PR #38 · merged'
		);
	}}
/>

<Story
	name="Cancelled with a non-URL source"
	args={args(single(ticketDetailCancelled))}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Cancelled');
		await expect(pane.querySelector('[data-field="source-ref"]')).toHaveTextContent(
			'notes/ticket.md'
		);
		await expect(pane.querySelector('[data-slot="open-in-tracker"]')).toBeNull();
	}}
/>

<Story
	name="Source from a tracker URL"
	args={args(running)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const tracker = pane.querySelector<HTMLAnchorElement>('[data-slot="open-in-tracker"]')!;
		await expect(tracker).toHaveAttribute('href', ticketDetailActiveInWork.sourceRef);
		await expect(tracker).toHaveAttribute('target', '_blank');
		await expect(tracker).toHaveAttribute('rel', 'noopener noreferrer');
		await expect(tracker).toHaveTextContent('opens in a new tab');
		for (const name of ['labels', 'author', 'dates', 'description']) {
			await expect(pane.querySelector(`[data-field="${name}"]`)).toHaveTextContent('Unavailable');
		}
	}}
/>

<Story
	name="Tracker warnings"
	args={args(single(ticketDetailTrackerWarnings))}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const warnings = pane.querySelector<HTMLElement>('[data-testid="tracker-warnings"]')!;
		await expect(warnings).toHaveAccessibleName('Tracker warnings');
		await expect(warnings).toHaveTextContent(ticketDetailTrackerWarnings.trackerWarnings[0]!);
		await expect(warnings.className).not.toMatch(/fault|destructive/);
		const reason = pane.querySelector('[data-testid="status-reason"]')!;
		await expect(warnings.contains(reason)).toBe(false);
	}}
/>

<Story
	name="Past execution with history"
	args={args(past)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const banner = pane.querySelector('[data-testid="past-execution"]')!;
		await expect(banner).toHaveTextContent('Past execution 1, read-only.');
		await expect(banner.querySelector('a')).toHaveTextContent('Go to the current execution');
		await expect(banner.querySelector('a')).toHaveAttribute('href', '#current');

		const rows = pane.querySelectorAll('[data-testid="executions"] [data-execution]');
		await expect(rows).toHaveLength(executionList.items.length);
		await expect(rows[0]).toHaveAttribute('data-selected', 'true');
		await expect(rows[1]).toHaveAttribute('data-selected', 'false');
		await expect(rows[0]!.querySelector('a')).toHaveAttribute('aria-current', 'page');
		await expect(rows[1]!.querySelector('a')).toHaveAttribute('href', '#current');
	}}
/>

<Story
	name="Rerun, current execution"
	args={args(rerun)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="past-execution"]')).toBeNull();
		const rows = pane.querySelectorAll('[data-testid="executions"] [data-execution]');
		await expect(rows[1]).toHaveAttribute('data-selected', 'true');
		await expect(rows[0]!.querySelector('a')).toHaveAttribute('href', '#execution-1');
	}}
/>

<Story
	name="Unknown stage"
	args={args(unknownStage)}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="unknown-stage"]')).toHaveTextContent(
			'Unrecognized stage “triage”'
		);
	}}
/>

<Story
	name="With Close"
	args={{ ...args(running), onclose: fn() }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const close = pane.querySelector<HTMLButtonElement>('button[aria-label="Close inspector"]')!;
		await expect(close).toBeTruthy();
		await userEvent.click(close);
		await expect(args.onclose).toHaveBeenCalledOnce();
	}}
/>
