<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import EfficiencySignals from './efficiency-signals.svelte';
	import { failedPanel, loadingPanel, readyPanel } from './panel-state';
	import {
		completeExport,
		emptyExport,
		exportFailure,
		failedMidStreamExport,
		malformedExport,
		truncatedExport,
		zeroMergesExport
	} from './stats-story-cohorts';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const row = (pane: HTMLElement, name: string) =>
		pane.querySelector(`[data-row="${name}"]`) as HTMLElement;
	const infra = (pane: HTMLElement) =>
		pane.querySelector('[data-testid="infrastructure-lost"]') as HTMLElement;
	const SHARES = [
		'waiting-share',
		'blended-cost-per-merged',
		'rework-token-share',
		'usage-coverage'
	];

	/** Every share and per-merge figure reads Unavailable with the reason, never 0. */
	const sharesUnavailable = async (pane: HTMLElement, reason: string) => {
		for (const name of SHARES) {
			const figure = row(pane, name);
			await expect(figure).toHaveAttribute('data-availability', 'unavailable');
			await expect(figure).toHaveTextContent('— Unavailable');
			await expect(figure).toHaveTextContent(reason);
		}
		for (const part of row(pane, 'rework-token-share').querySelectorAll('[data-purpose]')) {
			await expect(part).toHaveAttribute('data-availability', 'unavailable');
		}
		await expect(infra(pane)).toHaveAttribute('data-availability', 'unavailable');
		await expect(pane).not.toHaveTextContent(/\b0(\.0)?%/);
		await expect(pane).not.toHaveTextContent('$0.00');
	};

	const { Story } = defineMeta({
		title: 'Components/Factory/Stats/EfficiencySignals',
		component: EfficiencySignals,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'Efficiency signals from the stats export: waiting share (weighted), blended cost per merged ticket, rework token share with its definition and per-purpose parts, and runs with known usage. Infrastructure-lost is a separate block: it overlaps with rework and is not a partition. When the export is incomplete a status line gives the malformed-line count or says it ended early, and shares read Unavailable.'
				}
			}
		}
	});
</script>

<Story
	name="Complete"
	args={{ state: readyPanel(completeExport.efficiency) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="export-status"]')).toBeNull();
		await expect(pane.querySelector('[data-testid="export-sample"]')).toHaveTextContent(
			'26 executions started in the window · 103 runs'
		);

		const blended = row(pane, 'blended-cost-per-merged');
		await expect(blended).toHaveAttribute('data-availability', 'complete');
		await expect(blended).toHaveTextContent('$3.01');
		await expect(blended).toHaveTextContent('blended: $48.20 total cost, all outcomes / 16 merged');

		const waiting = row(pane, 'waiting-share');
		await expect(waiting).toHaveTextContent('4.5%');
		await expect(waiting).toHaveTextContent(
			'4 h 5 m waiting before handoff of 90 h 20 m start → handoff · over 20 executions that reached handoff (6 excluded)'
		);
		await expect(waiting).toHaveTextContent('not a mean of per-execution shares');

		const rework = row(pane, 'rework-token-share');
		await expect(rework).toHaveTextContent('7.7%');
		await expect(rework).toHaveTextContent(
			'369,093 of 4,820,000 tokens over 102 runs with known usage'
		);
		await expect(rework.querySelector('[data-testid="rework-definition"]')).toHaveTextContent(
			'Tokens of return-to-work and validation-correction runs'
		);
		const parts = [...rework.querySelectorAll('[data-purpose]')].map((item) =>
			item.textContent?.replace(/\s+/g, ' ').trim()
		);
		await expect(parts).toEqual([
			'Return to work 5.6% · 269,093 tokens · 3 runs',
			'Validation correction 2.1% · 100,000 tokens · 2 runs'
		]);

		await expect(row(pane, 'usage-coverage')).toHaveTextContent(
			'102 of 103 runs · 1 with unknown usage, left out of token shares'
		);

		const lost = infra(pane);
		await expect(lost).toHaveAttribute('data-availability', 'complete');
		await expect(within(lost).getByRole('heading', { name: 'Infrastructure-lost' })).toBeVisible();
		await expect(lost).toHaveTextContent(
			'Overlaps with rework: a separate measure, not a partition'
		);
		await expect(lost.querySelector('[data-figure="attempts"]')).toHaveTextContent('4 of 103 runs');
		await expect(lost.querySelector('[data-figure="tokens"]')).toHaveTextContent(
			'195,156 · 4% of 4,820,000 known-usage tokens'
		);
		await expect(lost.querySelector('[data-figure="overlap"]')).toHaveTextContent(
			'1 run · 66,666 tokens counted in both'
		);
		// Infrastructure-lost is outside the rework row: not one of its parts.
		await expect(rework.contains(lost)).toBe(false);
	}}
/>

<Story
	name="Export failed"
	args={{ state: failedPanel(exportFailure), onretry: fn() }}
	play={async ({ canvasElement, args }) => {
		const pane = firstPane(canvasElement);
		const panel = pane.querySelector('[data-slot="efficiency-signals"]')!;
		await expect(panel).toHaveAttribute('data-state', 'error');
		await expect(panel.querySelector('[data-testid="panel-error-title"]')).toHaveTextContent(
			'Efficiency signals unavailable'
		);
		await expect(panel.querySelector('[data-row]')).toBeNull();
		await expect(panel).not.toHaveTextContent(/http|detail|problem/i);
		await userEvent.click(within(pane).getByRole('button', { name: 'Retry' }));
		await expect(args.onretry).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Malformed lines reported"
	args={{ state: readyPanel(malformedExport.efficiency) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const status = pane.querySelector('[data-testid="export-status"]')!;
		await expect(status).toHaveTextContent('Export incomplete — 2 malformed lines');
		await expect(status).toHaveAttribute('data-malformed-lines', '2');
		await sharesUnavailable(pane, 'export incomplete — 2 malformed lines');
		await expect(pane.querySelector('[data-testid="export-sample"]')).toHaveTextContent(
			'26 executions started in the window · 103 runs · partial'
		);
		await expect(
			infra(pane).querySelector('[data-figure="attempts"] [data-availability="partial"]')
		).toHaveTextContent('4');
	}}
/>

<Story
	name="Truncated"
	args={{ state: readyPanel(truncatedExport.efficiency) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="export-status"]')).toHaveTextContent(
			'Export incomplete — 1 malformed line, export ended early'
		);
		await sharesUnavailable(pane, 'export ended early');
	}}
/>

<Story
	name="Failed mid-stream"
	args={{ state: readyPanel(failedMidStreamExport.efficiency) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const status = pane.querySelector('[data-testid="export-status"]')!;
		await expect(status).toHaveTextContent('Export incomplete — export ended early');
		await expect(status).toHaveAttribute('data-malformed-lines', '0');
		await sharesUnavailable(pane, 'export ended early');
	}}
/>

<Story
	name="Zero merges"
	args={{ state: readyPanel(zeroMergesExport.efficiency) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="export-status"]')).toBeNull();
		const blended = row(pane, 'blended-cost-per-merged');
		await expect(blended).toHaveAttribute('data-availability', 'unavailable');
		await expect(blended).toHaveTextContent('— Unavailable — no merged executions');
		await expect(blended).toHaveTextContent('$7.45 total cost, all outcomes / 0 merged');
		await expect(blended).not.toHaveTextContent('$0.00');
		// Zero is a measurement when the sample is not empty.
		await expect(row(pane, 'waiting-share')).toHaveAttribute('data-availability', 'complete');
		await expect(row(pane, 'waiting-share')).toHaveTextContent('0%');
	}}
/>

<Story
	name="Empty window"
	args={{ state: readyPanel(emptyExport.efficiency) }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(pane.querySelector('[data-testid="export-status"]')).toBeNull();
		await expect(pane.querySelector('[data-testid="export-sample"]')).toHaveTextContent(
			'0 executions started in the window · 0 runs'
		);
		await expect(row(pane, 'waiting-share')).toHaveTextContent('no executions reached handoff');
		await expect(row(pane, 'blended-cost-per-merged')).toHaveTextContent('no merged executions');
		await expect(row(pane, 'rework-token-share')).toHaveTextContent('no runs with known usage');
		for (const name of SHARES) {
			await expect(row(pane, name)).toHaveAttribute('data-availability', 'unavailable');
		}
	}}
/>

<Story
	name="Loading"
	args={{ state: loadingPanel }}
	play={async ({ canvasElement }) => {
		const panel = firstPane(canvasElement).querySelector('[data-slot="efficiency-signals"]')!;
		await expect(panel).toHaveAttribute('aria-busy', 'true');
		await expect(panel.querySelector('[data-slot="stats-skeleton"]')).not.toBeNull();
	}}
/>
