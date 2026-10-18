<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
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

<Story name="All variants" asChild>
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
