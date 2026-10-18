import type { Preview } from '@storybook/sveltekit';
import '../src/routes/layout.css';
import ThemeDecorator from './theme-decorator.svelte';

const preview: Preview = {
	globalTypes: {
		theme: {
			description: 'Color theme (applies the .dark class like ModeWatcher)',
			toolbar: {
				title: 'Theme',
				icon: 'mirror',
				items: [
					{ value: 'light', title: 'Light', icon: 'sun' },
					{ value: 'dark', title: 'Dark', icon: 'moon' },
					{ value: 'side-by-side', title: 'Light and dark', icon: 'sidebyside' }
				],
				dynamicTitle: true
			}
		}
	},
	initialGlobals: {
		theme: 'light'
	},
	decorators: [
		(_story, context) => ({
			Component: ThemeDecorator,
			props: { theme: context.globals.theme }
		})
	],
	parameters: {
		layout: 'fullscreen',
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i
			}
		},
		a11y: {
			// Report violations in the a11y panel and test output without failing.
			test: 'todo'
		}
	}
};

export default preview;
