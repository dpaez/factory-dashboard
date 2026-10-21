import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

export default defineConfig({
	ssr: {
		noExternal: ['@tanstack/svelte-table']
	},
	// Pre-bundle up front: a dependency discovered on first story visit makes the
	// Storybook dev server re-optimize and reload every open page.
	optimizeDeps: {
		include: ['marked']
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					// A few short files: run them one at a time so a click never waits on
					// another file's iframe while the storybook project is busy.
					fileParallelism: false,
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				plugins: [
					// Every *.stories.svelte runs as a test. The side-by-side theme renders each
					// story once in a light pane and once in a `.dark` pane.
					storybookTest({
						configDir: '.storybook',
						storybookScript: 'pnpm storybook --ci',
						initialGlobals: { theme: 'side-by-side' }
					})
				],
				test: {
					name: 'storybook',
					// Stories render without explicit assertions; scoped to this project only.
					expect: { requireAssertions: false },
					browser: {
						enabled: true,
						provider: playwright(),
						headless: true,
						instances: [{ browser: 'chromium' }]
					}
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
