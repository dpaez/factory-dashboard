<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor, within } from 'storybook/test';
	import Badge from './badge.svelte';

	const { Story } = defineMeta({
		title: 'UI/Badge',
		component: Badge,
		argTypes: {
			variant: {
				control: 'select',
				options: ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link']
			}
		}
	});
</script>

<Story name="Default" args={{ variant: 'default' }}>Running</Story>

<Story name="Secondary" args={{ variant: 'secondary' }}>Ready for review</Story>

<Story name="Destructive" args={{ variant: 'destructive' }}>Failed</Story>

<Story name="Outline" args={{ variant: 'outline' }}>feature</Story>

<Story name="Ghost" args={{ variant: 'ghost' }}>Planned</Story>

<Story name="Link" args={{ variant: 'link', href: '#' }}>Open ticket</Story>

<!-- DESIGN.md: numbers and refs use JetBrains Mono, and the font really loads. Light and dark
     panes resolve different tokens. -->
<Story
	name="All variants"
	asChild
	play={async ({ canvasElement }) => {
		const panes = [...canvasElement.querySelectorAll<HTMLElement>('[data-theme-pane]')];
		await expect(panes).toHaveLength(2);
		const primaries = panes.map((pane) =>
			getComputedStyle(within(pane).getByText('secondary')).getPropertyValue('--primary').trim()
		);
		await expect(primaries[0]).not.toBe(primaries[1]);
		const mono = within(panes[0]!).getByText('font-mono');
		await expect(getComputedStyle(mono).fontFamily).toMatch(/JetBrains Mono/);
		await waitFor(async () => {
			await document.fonts.ready;
			await expect(document.fonts.check('12px "JetBrains Mono Variable"')).toBe(true);
		});
	}}
>
	<div class="flex flex-wrap items-center gap-2">
		<Badge variant="default">default</Badge>
		<Badge variant="secondary">secondary</Badge>
		<Badge variant="destructive">destructive</Badge>
		<Badge variant="outline">outline</Badge>
		<Badge variant="ghost">ghost</Badge>
		<Badge variant="link" href="#">link</Badge>
		<Badge variant="outline" class="font-mono">font-mono</Badge>
	</div>
</Story>
