import { describe, expect, it } from 'vitest';
import readme from '../../../README.md?raw';

// The README section is the shipped artifact for the sbx-shell-pi kit mixin integration, and the
// integration is not published yet. These assertions keep the documented contract (in-progress
// marker, mixin requirements, planned usage) from silently drifting while the upstream PR moves.
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

	it('is marked in progress and says the mixin is not published', () => {
		expect(section).toMatch(/\*\*Status: in progress\*\*/);
		expect(section).toMatch(/not published yet/i);
	});

	it('links the upstream kits migration PR', () => {
		expect(section).toContain('https://github.com/geut/sbx-shell-pi/pull/6');
	});

	it('states the mixin requirements and the factory-only composition', () => {
		expect(section).toContain('`node >= 24`');
		expect(section).toContain('`pi-factory >= 1`');
		expect(section).toMatch(/`factory` workload/);
	});

	it('keeps Herdr as entrypoint and the dashboard read-only on the state db', () => {
		expect(section).toMatch(/Herdr stays the entrypoint/);
		expect(section).toContain('`.factory/db/state.sqlite`');
		expect(section).toMatch(/terminal remains the control path/);
	});

	it('shows the planned sbx run usage with the tentative mixin tag', () => {
		expect(section).toMatch(/Planned usage/i);
		expect(section).toContain(
			'sbx run --name factory ghcr.io/geut/sbx-shell-pi:node-24-factory /path/to/project'
		);
		expect(section).toContain('--kit ghcr.io/geut/sbx-kit-factory-dashboard:0.1.0');
		expect(section).toMatch(/tentative/);
	});

	it('is reachable from the "Who this is for" section', () => {
		expect(readme).toContain('](#sbx-shell-pi-kit-integration-in-progress)');
	});
});
