<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { ArrowRight, Factory, Plus } from '@lucide/svelte';
	import { expect, within } from 'storybook/test';
	import Button from './button.svelte';

	const variants = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const;
	const sizes = ['xs', 'sm', 'default', 'lg'] as const;
	const iconSizes = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const;

	const { Story } = defineMeta({
		title: 'UI/Button',
		component: Button,
		argTypes: {
			variant: { control: 'select', options: variants },
			size: { control: 'select', options: [...sizes, ...iconSizes] },
			disabled: { control: 'boolean' },
			href: { control: 'text' }
		}
	});
</script>

<Story name="Default" args={{ variant: 'default' }}>Start run</Story>

<Story name="Outline" args={{ variant: 'outline' }}>Tickets</Story>

<Story name="Secondary" args={{ variant: 'secondary' }}>Refresh</Story>

<Story name="Ghost" args={{ variant: 'ghost' }}>Dismiss</Story>

<Story name="Destructive" args={{ variant: 'destructive' }}>Cancel run</Story>

<Story name="Link" args={{ variant: 'link' }}>View plan</Story>

<Story name="Disabled" args={{ variant: 'default', disabled: true }}>Start run</Story>

<!-- DESIGN.md: Beacon Yellow is the primary in each theme, and buttons are square. -->
<Story
	name="All variants"
	asChild
	play={async ({ canvasElement }) => {
		const beacon = { light: 'oklch(0.852 0.199 91.936)', dark: 'oklch(0.795 0.184 86.047)' };
		const panes = [...canvasElement.querySelectorAll<HTMLElement>('[data-theme-pane]')];
		await expect(panes.map((pane) => pane.dataset.themePane)).toEqual(['light', 'dark']);
		for (const pane of panes) {
			const button = within(pane).getByRole('button', { name: 'default' });
			const primary = getComputedStyle(button).getPropertyValue('--primary').trim();
			await expect(primary).toBe(beacon[pane.dataset.themePane as 'light' | 'dark']);
			for (const each of within(pane).getAllByRole('button')) {
				await expect(getComputedStyle(each).borderRadius).toBe('0px');
			}
		}
	}}
>
	<div class="flex flex-wrap items-center gap-2">
		{#each variants as variant (variant)}
			<Button {variant}>{variant}</Button>
		{/each}
	</div>
</Story>

<Story name="Sizes" asChild>
	<div class="flex flex-col gap-3">
		<div class="flex flex-wrap items-center gap-2">
			{#each sizes as size (size)}
				<Button {size}>{size}</Button>
			{/each}
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#each iconSizes as size (size)}
				<Button {size} variant="outline" aria-label={`Add (${size})`}><Plus /></Button>
			{/each}
		</div>
	</div>
</Story>

<Story name="As link" asChild>
	<div class="flex flex-wrap items-center gap-2">
		<Button href="#" variant="outline" size="lg">
			<Factory data-icon="inline-start" /> Main
		</Button>
		<Button href="#" variant="link">
			Open ticket <ArrowRight data-icon="inline-end" />
		</Button>
		<Button href="#" variant="default" disabled>Disabled link</Button>
	</div>
</Story>
