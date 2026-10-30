import { describe, expect, it } from 'vitest';
import readme from '../../../README.md?raw';

// The README section is the shipped artifact for the sbx-shell-pi kit mixin integration, and the
// integration is not published yet. These assertions keep the documented contract (planned marker,
// mixin versus set, reference, startup, and walkthrough) from silently drifting.
const sectionStart = readme.indexOf('## sbx-shell-pi kit integration (in progress)');
const developmentStart = readme.indexOf('## Development');
const section =
	sectionStart === -1 || developmentStart === -1
		? ''
		: readme.slice(sectionStart, developmentStart);

describe('README sbx-shell-pi kit integration section', () => {
	it('exists as its own section before Development', () => {
		expect(sectionStart).toBeGreaterThan(-1);
		expect(developmentStart).toBeGreaterThan(sectionStart);
	});

	it('is marked planned and says the mixin is not published', () => {
		expect(section).toMatch(/\*\*Status: planned\*\*/);
		expect(section).toMatch(/not published yet/i);
	});

	it('links the upstream kits migration PR', () => {
		expect(section).toContain('https://github.com/geut/sbx-shell-pi/pull/6');
	});

	it('explains mixin versus set', () => {
		expect(section).toMatch(/v3 \*\*mixin\*\* kit/);
		expect(section).toMatch(/publishes a \*\*set\*\*/);
		expect(section).toMatch(/`--kit` on the factory workload/);
	});

	it('names the mixin reference and the factory contract', () => {
		expect(section).toContain('`ghcr.io/dpaez/sbx-kit-factory-dashboard:0.1.0`');
		expect(section).toContain('`node >= 24`');
		expect(section).toContain('`io.github.geut/pi-factory >= 1`');
		expect(section).toContain('https://github.com/geut/sbx-shell-pi#factory-contract');
		expect(section).toMatch(/sbx 0\.47 or newer/);
		expect(section).toContain('`long-running@1`');
	});

	it('states the factory-up contract the dashboard relies on', () => {
		expect(section).toContain('container port `7731`');
		expect(section).toContain('`0.0.0.0`');
		expect(section).toContain('`.factory/dashboard.env`');
		expect(section).toContain('mode `0600`');
		expect(section).toContain('`FACTORY_API_URL`');
		expect(section).toContain('`FACTORY_API_TOKEN`');
		expect(section).toMatch(/`dashboard` client/);
	});

	it('describes the planned startup', () => {
		expect(section).toMatch(/\*\*Planned startup\.\*\*/);
		expect(section).toMatch(/Herdr stays the entrypoint/);
		expect(section).toContain('container port `7732`');
		expect(section).toContain('`HOST=0.0.0.0`');
		expect(section).toContain('`factory-dashboard`');
		expect(section).toContain('`$WORKSPACE_DIR/.factory/dashboard.env`');
		expect(section).toMatch(/run `factory-up`/);
	});

	it('shows the planned walkthrough', () => {
		expect(section).toMatch(/\*\*Planned walkthrough\*\*/);
		expect(section).toContain(
			'sbx run --name factory ghcr.io/geut/sbx-shell-pi:node-24-factory /path/to/project'
		);
		expect(section).toContain('--kit ghcr.io/dpaez/sbx-kit-factory-dashboard:0.1.0');
		expect(section).toContain('`.factory/FACTORY.json`');
		expect(section).toContain('`factory-up`');
		expect(section).toContain('`sbx ports factory`');
		expect(section).toMatch(/mixin set is fixed when the sandbox is created/);
	});

	it('drops the old image name and any state.sqlite read', () => {
		expect(section).not.toContain('ghcr.io/geut/sbx-kit-factory-dashboard');
		expect(section).not.toContain('state.sqlite');
	});

	it('is reachable from the "Who this is for" section', () => {
		expect(readme).toContain('](#sbx-shell-pi-kit-integration-in-progress)');
	});
});
