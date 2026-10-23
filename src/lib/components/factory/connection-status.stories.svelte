<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import ConnectionStatus from './connection-status.svelte';
	import type { ConnectionState } from '$lib/factory/live';

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;
	const root = (pane: HTMLElement) =>
		pane.querySelector<HTMLElement>('[data-slot="connection-status"]')!;
	const stateText = (pane: HTMLElement) => pane.querySelector<HTMLElement>('[aria-live="polite"]')!;

	const lastRefreshAt = '2026-10-21T14:32:05Z';
	const states: ConnectionState[] = [
		'connecting',
		'live',
		'reconnecting',
		'disconnected',
		'auth_failed'
	];

	const { Story } = defineMeta({
		title: 'Components/Factory/ConnectionStatus',
		component: ConnectionStatus,
		argTypes: {
			state: { control: 'select', options: states },
			lastRefreshAt: { control: 'text' }
		},
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						'The header\'s connection to the factory event stream: Connecting, Live, Reconnecting, Disconnected or Authentication failed, as a signal chip in a polite live region. Authentication failed and Disconnected differ in label, icon and explanation. When not live, "Last refresh" shows the time the last refetch settled, or Unavailable. Retry appears for Disconnected and Authentication failed when `onretry` is given. Loading, empty and error states: the five states are the component.'
				}
			}
		}
	});
</script>

<Story
	name="Connecting"
	args={{ state: 'connecting', lastRefreshAt: null }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(root(pane)).toHaveAttribute('data-state', 'connecting');
		await expect(stateText(pane)).toHaveTextContent('Connecting');
		await expect(pane).toHaveTextContent('Last refresh');
		await expect(pane).toHaveTextContent('Unavailable');
		await expect(pane.querySelector('time')).toBeNull();
		await expect(within(pane).queryByRole('button')).toBeNull();
	}}
/>

<Story
	name="Live"
	args={{ state: 'live', lastRefreshAt, onretry: fn() }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(root(pane)).toHaveAttribute('data-state', 'live');
		await expect(stateText(pane)).toHaveTextContent('Live');
		await expect(pane.querySelector('[data-slot="status-badge"]')).toHaveAttribute(
			'data-signal',
			'run'
		);
		await expect(pane).not.toHaveTextContent('Last refresh');
		await expect(pane.querySelector('time')).toBeNull();
		await expect(within(pane).queryByRole('button', { name: 'Retry' })).toBeNull();
	}}
/>

<Story
	name="Reconnecting"
	args={{ state: 'reconnecting', lastRefreshAt, onretry: fn() }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(stateText(pane)).toHaveTextContent('Reconnecting');
		const time = pane.querySelector('time')!;
		await expect(time).toHaveAttribute('datetime', lastRefreshAt);
		await expect(time).toHaveTextContent('2026-10-21 14:32 UTC');
		await expect(time).toHaveClass('font-mono', 'tabular-nums');
		await expect(within(pane).queryByRole('button', { name: 'Retry' })).toBeNull();
	}}
/>

<Story
	name="Disconnected"
	args={{ state: 'disconnected', lastRefreshAt, onretry: fn() }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(root(pane)).toHaveAttribute('data-state', 'disconnected');
		await expect(stateText(pane)).toHaveTextContent(
			'Disconnected The event stream stopped. Data may be out of date.'
		);
		await expect(stateText(pane)).not.toHaveTextContent('Authentication failed');
		await expect(stateText(pane)).not.toHaveTextContent('token');
		await expect(pane.querySelector('svg.lucide-unplug')).not.toBeNull();
		await expect(pane.querySelector('time')).toHaveTextContent('2026-10-21 14:32 UTC');
		await userEvent.click(within(pane).getByRole('button', { name: 'Retry' }));
		await expect(args.onretry).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Authentication failed"
	args={{ state: 'auth_failed', lastRefreshAt, onretry: fn() }}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(root(pane)).toHaveAttribute('data-state', 'auth_failed');
		await expect(stateText(pane)).toHaveTextContent(
			"Authentication failed The factory refused the dashboard's token."
		);
		await expect(stateText(pane)).not.toHaveTextContent('Disconnected');
		await expect(stateText(pane)).not.toHaveTextContent('event stream stopped');
		await expect(pane.querySelector('svg.lucide-key-round')).not.toBeNull();
		await expect(pane.querySelector('svg.lucide-unplug')).toBeNull();
		await expect(pane).toHaveTextContent('Last refresh');
		await userEvent.click(within(pane).getByRole('button', { name: 'Retry' }));
		await expect(args.onretry).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Disconnected, never refreshed"
	args={{ state: 'disconnected', lastRefreshAt: null }}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(stateText(pane)).toHaveTextContent('Disconnected');
		await expect(pane).toHaveTextContent('Last refresh');
		await expect(pane).toHaveTextContent('Unavailable');
		await expect(pane.querySelector('time')).toBeNull();
		// No onretry, no Retry control.
		await expect(within(pane).queryByRole('button')).toBeNull();
	}}
/>
