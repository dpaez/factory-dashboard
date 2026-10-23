import { defineConfig } from '@playwright/test';

// The fake factory (test/fake-factory.ts) serves typed fixtures over GET and accepts commands.
const FAKE_FACTORY_PORT = 7799;
const FAKE_FACTORY_TOKEN = 'fake-factory-token-e2e';

export default defineConfig({
	webServer: [
		{
			command: 'node test/fake-factory.ts',
			port: FAKE_FACTORY_PORT,
			env: { FAKE_FACTORY_PORT: String(FAKE_FACTORY_PORT), FAKE_FACTORY_TOKEN },
			reuseExistingServer: false
		},
		{
			command: 'pnpm run build && pnpm run preview',
			port: 4173,
			env: {
				FACTORY_API_URL: `http://127.0.0.1:${FAKE_FACTORY_PORT}`,
				FACTORY_API_TOKEN: FAKE_FACTORY_TOKEN
			}
		},
		{
			command: 'pnpm storybook --ci',
			url: 'http://localhost:6006/index.json',
			reuseExistingServer: !process.env.CI,
			timeout: 180_000
		}
	],
	use: { baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.{ts,js}'
});
