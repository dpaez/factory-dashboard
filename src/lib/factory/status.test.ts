import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	ATTENTION_REASON_SIGNALS,
	BACKLOG_AVAILABILITY_SIGNALS,
	EXECUTION_STATUS_SIGNALS,
	RUN_STATUS_SIGNALS,
	TASK_STAGE_LABELS,
	TASK_STATUS_SIGNALS,
	attentionReasonSignal,
	backlogAvailabilitySignal,
	executionStatusSignal,
	handoffStatusSignal,
	runStatusSignal,
	taskStatusSignal,
	type Signal
} from './status';

const SIGNALS: readonly Signal[] = ['run', 'wait', 'standby', 'fault', 'clear'];

type JsonSchema = { enum?: unknown[]; anyOf?: JsonSchema[]; type?: string };

const snapshot = JSON.parse(
	readFileSync(new URL('../../../openapi/factory.openapi.json', import.meta.url), 'utf8')
) as { components: { schemas: Record<string, { properties: Record<string, JsonSchema> }> } };

function property(schema: string, name: string): JsonSchema {
	const prop = snapshot.components.schemas[schema]?.properties[name];
	if (!prop) throw new Error(`OpenAPI snapshot has no ${schema}.${name}`);
	return prop;
}

/** The string enum values of a property, including those nested under `anyOf`. */
function enumValues(schema: string, name: string): string[] {
	const prop = property(schema, name);
	const values = [prop, ...(prop.anyOf ?? [])].flatMap((s) => s.enum ?? []);
	if (values.length === 0) throw new Error(`${schema}.${name} has no enum`);
	return values.map(String);
}

function isNullable(schema: string, name: string): boolean {
	const prop = property(schema, name);
	return [prop, ...(prop.anyOf ?? [])].some((s) => s.type === 'null');
}

const executionStatuses = [
	...new Set(['Execution', 'TicketSummary', 'TicketDetail'].flatMap((s) => enumValues(s, 'status')))
];
const taskStatuses = enumValues('Task', 'status');
const taskStages = enumValues('Task', 'stage');

describe('executionStatusSignal', () => {
	it('reads a non-empty enum from the snapshot', () => {
		expect(executionStatuses.length).toBeGreaterThan(0);
	});

	it.each(executionStatuses)('maps execution status %s explicitly', (status) => {
		expect(Object.hasOwn(EXECUTION_STATUS_SIGNALS, status)).toBe(true);
		const result = executionStatusSignal(status);
		expect(SIGNALS).toContain(result.signal);
		expect(result.label.trim()).not.toBe('');
	});

	it('maps queued to wait and cancelled to standby', () => {
		expect(executionStatusSignal('queued').signal).toBe('wait');
		expect(executionStatusSignal('cancelled').signal).toBe('standby');
	});

	it('uses glossary wording for labels', () => {
		expect(executionStatusSignal('waiting_for_user').label).toBe('Waiting for user');
		expect(executionStatusSignal('ready_for_handoff').label).toBe('Ready for handoff');
		expect(executionStatusSignal('resume_failed').label).toBe('Resume failed');
		expect(executionStatusSignal('complete').label).toBe('Complete');
	});

	it('maps unknown values to standby with the raw value as label', () => {
		expect(executionStatusSignal('exploded')).toEqual({ signal: 'standby', label: 'exploded' });
		expect(executionStatusSignal('toString')).toEqual({ signal: 'standby', label: 'toString' });
	});

	it('never returns an empty label', () => {
		expect(executionStatusSignal('').label.trim()).not.toBe('');
	});
});

describe('handoffStatusSignal', () => {
	it('reads Preparing handoff while wrapup runs', () => {
		for (const status of ['active', 'queued', 'resuming']) {
			expect(handoffStatusSignal(status)).toEqual({ signal: 'run', label: 'Preparing handoff' });
		}
	});

	it('reads Ready for handoff when ready, and the normal signal otherwise', () => {
		expect(handoffStatusSignal('ready_for_handoff')).toEqual({
			signal: 'wait',
			label: 'Ready for handoff'
		});
		expect(handoffStatusSignal('paused')).toEqual(executionStatusSignal('paused'));
		expect(handoffStatusSignal('hibernating')).toEqual({ signal: 'standby', label: 'hibernating' });
	});
});

describe('taskStatusSignal', () => {
	it('reads non-empty enums and a nullable stage from the snapshot', () => {
		expect(taskStatuses.length).toBeGreaterThan(0);
		expect(taskStages.length).toBeGreaterThan(0);
		expect(isNullable('Task', 'stage')).toBe(true);
	});

	const combinations = taskStatuses.flatMap((status) =>
		[...taskStages, null].map((stage) => [status, stage] as const)
	);

	it.each(combinations)('maps task %s at stage %s explicitly', (status, stage) => {
		expect(Object.hasOwn(TASK_STATUS_SIGNALS, status)).toBe(true);
		if (stage !== null) expect(Object.hasOwn(TASK_STAGE_LABELS, stage)).toBe(true);
		const result = taskStatusSignal(status, stage);
		expect(SIGNALS).toContain(result.signal);
		expect(result.label.trim()).not.toBe('');
	});

	it('maps cancelled to standby, never clear', () => {
		for (const stage of [...taskStages, null]) {
			expect(taskStatusSignal('cancelled', stage).signal).toBe('standby');
		}
	});

	it('maps active to run at every stage', () => {
		for (const stage of [...taskStages, null]) {
			expect(taskStatusSignal('active', stage).signal).toBe('run');
		}
	});

	it('labels status and stage together', () => {
		expect(taskStatusSignal('active', 'review').label).toBe('Active · review');
		expect(taskStatusSignal('blocked', 'qa').label).toBe('Blocked · QA');
	});

	it('labels a null stage with the status alone', () => {
		expect(taskStatusSignal('pending', null)).toEqual({ signal: 'standby', label: 'Pending' });
		expect(taskStatusSignal('done', null)).toEqual({ signal: 'clear', label: 'Done' });
	});

	it('maps unknown statuses to standby with the raw value as label', () => {
		expect(taskStatusSignal('exploded', null)).toEqual({ signal: 'standby', label: 'exploded' });
		expect(taskStatusSignal('exploded', 'review')).toEqual({
			signal: 'standby',
			label: 'exploded · review'
		});
	});

	it('keeps an unknown stage visible as raw text', () => {
		expect(taskStatusSignal('active', 'deploy')).toEqual({
			signal: 'run',
			label: 'Active · deploy'
		});
	});

	it('never returns an empty label', () => {
		expect(taskStatusSignal('', null).label.trim()).not.toBe('');
	});
});

describe('runStatusSignal', () => {
	const runStatuses = enumValues('Run', 'status');

	it.each(runStatuses)('maps run status %s explicitly', (status) => {
		expect(Object.hasOwn(RUN_STATUS_SIGNALS, status)).toBe(true);
		expect(SIGNALS).toContain(runStatusSignal(status).signal);
	});

	it('maps unknown values to standby with the raw value', () => {
		expect(runStatusSignal('exploded')).toEqual({ signal: 'standby', label: 'exploded' });
	});
});

describe('backlogAvailabilitySignal', () => {
	it('maps Blocked to the Wait tone', () => {
		expect(backlogAvailabilitySignal('blocked')).toEqual({ signal: 'wait', label: 'Blocked' });
	});

	it('maps Ready and Umbrella to a non-terminal tone, never Clear', () => {
		expect(backlogAvailabilitySignal('ready')).toEqual({ signal: 'standby', label: 'Ready' });
		expect(backlogAvailabilitySignal('umbrella')).toEqual({ signal: 'standby', label: 'Umbrella' });
	});

	it('uses only the five signal tones', () => {
		for (const value of Object.values(BACKLOG_AVAILABILITY_SIGNALS)) {
			expect(SIGNALS).toContain(value.signal);
			expect(value.signal).not.toBe('clear');
		}
	});
});

describe('attentionReasonSignal', () => {
	it('maps every reason to its label and tone', () => {
		expect(ATTENTION_REASON_SIGNALS).toEqual({
			question: { signal: 'wait', label: 'Question' },
			limit: { signal: 'wait', label: 'Limit' },
			approval: { signal: 'wait', label: 'Approval' },
			waiting: { signal: 'wait', label: 'Waiting for a reply' },
			paused: { signal: 'standby', label: 'Paused' },
			failed: { signal: 'fault', label: 'Failed' },
			handoff: { signal: 'wait', label: 'Ready for handoff' }
		});
		expect(attentionReasonSignal('failed')).toEqual({ signal: 'fault', label: 'Failed' });
	});

	it('never uses Clear', () => {
		for (const value of Object.values(ATTENTION_REASON_SIGNALS)) {
			expect(SIGNALS).toContain(value.signal);
			expect(value.signal).not.toBe('clear');
		}
	});
});
