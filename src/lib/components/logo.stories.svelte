<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Logo from './logo.svelte';

	const { Story } = defineMeta({
		title: 'Components/Logo',
		component: Logo
	});
</script>

<Story name="Default" />
