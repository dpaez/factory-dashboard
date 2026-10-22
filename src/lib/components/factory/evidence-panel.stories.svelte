<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import EvidencePanel from './evidence-panel.svelte';
	import { toRunDetail } from '$lib/factory/adapters';
	import type { RunDetailViewState } from '$lib/factory/run-detail-state.svelte';
	import {
		runHistoryReviewChanges,
		runHistoryReturnToWork,
		runHistoryWorkCrashed,
		runReviewApproved,
		runWorkValidationFailed
	} from '$lib/factory/fixtures';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const loaded = (run: Parameters<typeof toRunDetail>[0]): RunDetailViewState => ({
		kind: 'loaded',
		run: toRunDetail(run)
	});

	const { Story } = defineMeta({
		title: 'Components/Factory/EvidencePanel',
		component: EvidencePanel,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'One run\'s evidence: identity, the latest validation report (status, attempt, summary, and each check with its status, command, exit code and duration) and the review (verdict, round, summary, findings with severity, blocking, evidence, location and suggestion). Paths are text, never links. A missing value reads "—". Loading, not-found and error states stay inside the panel; a retryable error offers Retry when `onretry` is given.'
				}
			}
		}
	});
</script>

<Story
	name="Validation failed"
	args={{ state: loaded(runWorkValidationFailed), caption: 'Latest run' }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="evidence-caption"]')).toHaveTextContent(
			'Latest run'
		);
		const validation = pane.querySelector<HTMLElement>('[data-testid="evidence-validation"]')!;
		await expect(validation).toHaveTextContent('Failed');
		await expect(validation).toHaveTextContent('attempt 2');
		await expect(validation).toHaveTextContent('1 of 4 checks failed.');
		const check = (name: string) =>
			validation.querySelector<HTMLElement>(`[data-check="${name}"]`)!;
		await expect(check('test')).toHaveTextContent('Failed');
		await expect(check('test').querySelector('[data-testid="check-command"]')).toHaveTextContent(
			'pnpm test'
		);
		await expect(check('test').querySelector('[data-testid="check-exit"]')).toHaveTextContent('1');
		await expect(check('test').querySelector('[data-testid="check-duration"]')).toHaveTextContent(
			'18.3 s'
		);
		await expect(check('lint')).toHaveTextContent('Passed');
		await expect(check('check')).toHaveTextContent('Skipped');
		await expect(check('worktree has a change')).toHaveTextContent('Error');
		await expect(
			check('worktree has a change').querySelector('[data-testid="check-command"]')
		).toHaveTextContent('—');
		await expect(pane.querySelector('[data-testid="evidence-review"]')).toHaveTextContent(
			'No review for this run.'
		);
	}}
/>

<Story
	name="Validation passed"
	args={{ state: loaded(runHistoryReturnToWork) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="evidence-purpose"]')).toHaveTextContent(
			'Return to work'
		);
		await expect(pane.querySelector('[data-testid="evidence-validation"]')).toHaveTextContent(
			'Passed'
		);
		await expect(pane.querySelector('[data-testid="evidence-session"]')).toHaveTextContent(
			'/home/agent/.pi/sessions/work-01-return.jsonl'
		);
		await expect(pane.querySelectorAll('a')).toHaveLength(0);
	}}
/>

<Story
	name="Review changes requested"
	args={{ state: loaded(runHistoryReviewChanges) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const review = pane.querySelector<HTMLElement>('[data-testid="evidence-review"]')!;
		await expect(review).toHaveTextContent('Changes requested');
		await expect(review).toHaveTextContent('round 1');
		const [f1, f2, f3] = [...review.querySelectorAll<HTMLElement>('[data-finding]')] as [
			HTMLElement,
			HTMLElement,
			HTMLElement
		];
		await expect([f1, f2, f3].map((f) => f.getAttribute('data-finding'))).toEqual([
			'R1-01',
			'R1-02',
			'R1-03'
		]);
		await expect(f1).toHaveTextContent('Critical');
		await expect(f1).toHaveTextContent('Blocking');
		await expect(f1.querySelector('[data-testid="finding-location"]')).toHaveTextContent(
			'src/lib/server/factory/client.ts:12'
		);
		await expect(f1.querySelector('[data-testid="finding-evidence"]')).toHaveTextContent(
			'src/lib/server/factory/client.ts:12 logs the token.'
		);
		await expect(f2).toHaveTextContent('Major');
		await expect(f2.querySelector('[data-testid="finding-location"]')).toHaveTextContent('—');
		await expect(f3).toHaveTextContent('Minor');
		await expect(f3.querySelector('[data-testid="finding-blocking"]')).toHaveTextContent(
			'Non-blocking'
		);
		// Paths are text: the evidence panel has no links.
		await expect(pane.querySelectorAll('a')).toHaveLength(0);
		await expect(pane.querySelectorAll('[href]')).toHaveLength(0);
	}}
/>

<Story
	name="Review approved, no findings"
	args={{ state: loaded(runReviewApproved) }}
	play={async ({ canvasElement }) => {
		const review = firstPane(canvasElement).querySelector('[data-testid="evidence-review"]')!;
		await expect(review).toHaveTextContent('Approved');
		await expect(review).toHaveTextContent('No findings.');
	}}
/>

<Story
	name="No usage"
	args={{ state: loaded(runHistoryWorkCrashed) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="evidence-usage"]')).toHaveTextContent(
			'Usage unavailable'
		);
		await expect(pane).not.toHaveTextContent('$0.00');
	}}
/>

<Story
	name="No validation and no review"
	args={{ state: loaded(runHistoryWorkCrashed) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="evidence-validation"]')).toHaveTextContent(
			'No validation recorded for this run.'
		);
		await expect(pane.querySelector('[data-testid="evidence-validation"]')).not.toHaveTextContent(
			'Passed'
		);
		await expect(pane.querySelector('[data-testid="evidence-review"]')).toHaveTextContent(
			'No review for this run.'
		);
	}}
/>

<Story
	name="Loading"
	args={{ state: { kind: 'loading' } }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="evidence-panel"]')!;
		await expect(panel).toHaveAttribute('aria-busy', 'true');
		await expect(panel.querySelector('[data-slot="evidence-skeleton"]')).not.toBeNull();
	}}
/>

<Story
	name="Not found"
	args={{ state: { kind: 'not_found', id: 'run_missing' } }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane).toHaveTextContent('No such run');
		await expect(pane.querySelector('[data-testid="not-found-run"]')).toHaveTextContent(
			'run_missing'
		);
	}}
/>

<Story
	name="Run-detail error"
	args={{
		state: { kind: 'error', title: 'Run unreachable', retryable: true },
		onretry: fn()
	}}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane).toHaveTextContent('Run unreachable');
		await userEvent.click(within(pane).getByRole('button', { name: 'Retry' }));
		await expect(args.onretry).toHaveBeenCalledOnce();
	}}
/>
