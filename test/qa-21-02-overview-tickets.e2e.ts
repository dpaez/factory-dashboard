import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

import {
	FAKE_FACTORY_TOKEN,
	agentList,
	allTickets,
	openTickets,
	startFakeFactory,
	type FakeFactoryOptions
} from './fake-factory';

// QA for ticket #21, task 02: overview and tickets list on the factory API.
const SHOTS = process.env.QA_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const SB = 'http://localhost:6006';
const story = (id: string, theme: string) =>
	`${SB}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`;

/** A fake factory with `options` and the built app pointed at it, on their own ports. */
function scenario(fakePort: number, appPort: number, options: FakeFactoryOptions, token?: string) {
	let fake: Server;
	let app: ChildProcess;
	test.beforeAll(async () => {
		({ server: fake } = await startFakeFactory(fakePort, options));
		app = spawn('node', ['build'], {
			env: {
				...process.env,
				PORT: String(appPort),
				FACTORY_API_URL: `http://127.0.0.1:${fakePort}`,
				FACTORY_API_TOKEN: token ?? FAKE_FACTORY_TOKEN
			},
			stdio: 'ignore'
		});
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`http://localhost:${appPort}/robots.txt`)).status > 0;
					} catch {
						return false;
					}
				},
				{ timeout: 30_000 }
			)
			.toBe(true);
	});
	test.afterAll(async () => {
		app?.kill();
		await new Promise((resolve) => fake?.close(resolve));
	});
	return `http://localhost:${appPort}`;
}

// Ticket #23 replaced the overview on / with the Flow board; AC1 now checks the board.
test('AC1: / shows the board summary and a QA lane card from the factory', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('[data-summary="agents-running"]')).toContainText(
		String(agentList.items.length)
	);
	const qa = page.getByRole('group', { name: /^QA\b/ });
	for (const ticket of openTickets.filter((t) => t.stage === 'qa')) {
		await expect(qa.locator(`[data-ticket-key="${ticket.key}"]`)).toBeVisible();
	}
	await shot(page, 'ac1-overview');
});

test('AC4: each tickets table row links to /tickets/<encoded key>', async ({ page }) => {
	await page.goto('/tickets');
	const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
	await expect(rows).toHaveCount(allTickets.length);
	for (const ticket of allTickets) {
		const link = page.getByRole('link', { name: ticket.displayRef, exact: true });
		await expect
			.soft(link.first())
			.toHaveAttribute('href', `/tickets/${encodeURIComponent(ticket.key)}`);
	}
	await shot(page, 'ac4-tickets-links');
});

test.describe('AC2: one failing detail read', () => {
	const base = scenario(7811, 4211, {
		failDetail: {
			keys: [openTickets[0]!.key],
			problem: { status: 500, title: 'Boom', type: 'internal_error' }
		}
	});

	test('AC2: that ticket card shows Unavailable tokens instead of zeros', async ({ page }) => {
		await page.goto(`${base}/`);
		const card = page.locator(`[data-ticket-key="${openTickets[0]!.key}"]`);
		await expect(card.locator('[data-slot="ticket-tokens"]')).toHaveText('Tokens Unavailable');
		await expect(card).not.toContainText('In 0');
		await shot(page, 'ac2-cost-unavailable');
	});
});

test.describe('AC3: more tickets than the pager bound', () => {
	// 20 pages × 4 per page = 80; list more so the pager stops with pages left.
	const many = Array.from({ length: 90 }, (_, i) => ({
		...allTickets[i % allTickets.length]!,
		id: `tkt_qa_${i}`,
		key: `qa-many-${i}`,
		displayRef: `qa/many#${i}`
	}));
	const base = scenario(7812, 4212, { tickets: many });

	test('AC3: /tickets reads every page and says when the list is partial', async ({ page }) => {
		await page.goto(`${base}/tickets`);
		const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
		await expect(rows).toHaveCount(80);
		await expect(page.getByText(/The list is partial/)).toBeVisible();
		await shot(page, 'ac3-tickets-partial');
	});

	test('AC3: a list within the bound shows every ticket and no partial note', async ({ page }) => {
		await page.goto('/tickets');
		const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
		await expect(rows).toHaveCount(allTickets.length);
		await expect(page.getByText(/The list is partial/)).toHaveCount(0);
	});
});

test.describe('AC5: the factory answers 401', () => {
	const base = scenario(7813, 4213, {}, 'qa-wrong-token');

	for (const path of ['/', '/tickets']) {
		test(`AC5: ${path} renders the 503 configuration error naming FACTORY_API_TOKEN`, async ({
			page
		}) => {
			const response = await page.goto(`${base}${path}`);
			expect(response?.status()).toBe(503);
			await expect(page.getByText('FACTORY_API_TOKEN').first()).toBeVisible();
			await expect(page.getByRole('table')).toHaveCount(0);
			await shot(page, `ac5-config-error${path === '/' ? '-home' : '-tickets'}`);
		});
	}
});

const STORIES: [string, string[]][] = [
	['components-infocostcard', ['default', 'zero-tokens', 'unavailable']],
	['components-infocard', ['needs-attention', 'zero', 'active-agents-unavailable']],
	[
		'components-ticketstable-table',
		['overview-rows-with-cost', 'empty', 'all-tickets-cost-unavailable']
	],
	['components-ticketstable-costcell', ['small', 'zero', 'unavailable']],
	['components-workcard', ['plan-stage', 'empty-stage']]
];

for (const [component, ids] of STORIES) {
	test(`AC8: ${component} stories render populated, empty and unavailable in light and dark`, async ({
		page
	}) => {
		test.setTimeout(120_000);
		for (const id of ids) {
			for (const theme of ['light', 'dark']) {
				const response = await page.goto(story(`${component}--${id}`, theme));
				expect.soft(response?.status(), `${id} ${theme}`).toBe(200);
				await expect
					.soft(page.locator('#storybook-root'), `${id} ${theme}`)
					.not.toBeEmpty({ timeout: 20_000 });
				await expect
					.poll(() => page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme))
					.toBe(theme);
			}
		}
	});
}

test('AC8: the open-ticket cost card unavailable story shows — in dark', async ({ page }) => {
	await page.goto(story('components-infocostcard--unavailable', 'dark'));
	await expect(page.getByText('—').first()).toBeVisible();
	await expect(page.getByText('$0.00')).toHaveCount(0);
	await shot(page, 'ac8-cost-card-unavailable-dark');
	await page.goto(story('components-ticketstable-table--empty', 'dark'));
	await expect(page.getByText('No tickets.')).toBeVisible();
	await shot(page, 'ac8-tickets-table-empty-dark');
});
