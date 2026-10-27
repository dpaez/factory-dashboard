/*
 * The `/v1/stats/export` NDJSON parser, browser-safe: an incremental line
 * parser with narrow runtime guards on the fields the dashboard reads, and an
 * explicit completeness verdict. The export has no completion marker, so any
 * doubt (a malformed or truncated line, an order or envelope violation, a run
 * for an unknown execution, a read failure, a bound) makes it incomplete.
 *
 * Bytes are decoded by the caller (one `TextDecoder` in `{stream: true}`
 * mode); the parser takes text in any chunking and never throws.
 */
import type { components } from './generated/factory-api';

type Schemas = components['schemas'];

/** The validated fields of a ticket line; other fields are dropped. */
export type ExportTicketLine = Pick<
	Schemas['StatsExportTicketLine'],
	| 'type'
	| 'execution'
	| 'key'
	| 'displayRef'
	| 'outcome'
	| 'startedAt'
	| 'handedOffAt'
	| 'startToHandoffMs'
	| 'factoryMs'
	| 'costUsd'
	| 'tokens'
	| 'factoryId'
	| 'definitions'
>;

/** The validated fields of a run line; other fields are dropped. */
export type ExportRunLine = Pick<
	Schemas['StatsExportRunLine'],
	| 'type'
	| 'execution'
	| 'run'
	| 'stage'
	| 'purpose'
	| 'returnedFrom'
	| 'infrastructureLost'
	| 'passed'
	| 'tokens'
	| 'tokensInput'
	| 'costUsd'
	| 'factoryId'
	| 'definitions'
>;

/** Why the export is not complete: a 1-based line number and a short reason, never content. */
export type ExportDiagnostic = { line: number; reason: string };

/** What every line of the export carries; null when the export has no line. */
export type ExportEnvelope = Pick<ExportTicketLine, 'factoryId' | 'definitions'>;

export type StatsExportParse = {
	tickets: ExportTicketLine[];
	runs: ExportRunLine[];
	envelope: ExportEnvelope | null;
	/** True only when nothing went wrong: no diagnostic at all. */
	complete: boolean;
	diagnostics: ExportDiagnostic[];
};

export type StatsExportParser = {
	/** Feed decoded text. Returns false once the line bound is hit: stop reading. */
	push(text: string): boolean;
	/** The body ended cleanly: settle the final unterminated fragment and return the result. */
	end(): StatsExportParse;
	/** The body failed (read error, abort, byte bound): drop the fragment and return the result. */
	fail(reason: string): StatsExportParse;
};

/** The only definitions version the generated contract allows; any other is not stats.v1. */
const DEFINITIONS = new Set(['stats.v1']);
const OUTCOMES = new Set(['abandoned', 'cancelled', 'merged', 'open', 'unknown']);
const STAGES = new Set(['plan', 'qa', 'review', 'work', 'wrapup']);
const PURPOSES = new Set([
	'initial',
	'validation_correction',
	'human_reply',
	'return_to_work',
	'reentry',
	'manual_continue',
	'infrastructure_retry'
]);

type Fields = Record<string, unknown>;

function isRecord(value: unknown): value is Fields {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);
const orNull =
	<T>(guard: (value: unknown) => value is T) =>
	(value: unknown): value is T | null =>
		value === null || guard(value);
const inSet =
	(set: Set<string>) =>
	(value: unknown): value is string =>
		isString(value) && set.has(value);

type Guard = (value: unknown) => boolean;

const TICKET_FIELDS: Record<Exclude<keyof ExportTicketLine, 'type'>, Guard> = {
	execution: isString,
	key: isString,
	displayRef: isString,
	outcome: inSet(OUTCOMES),
	startedAt: isString,
	handedOffAt: orNull(isString),
	startToHandoffMs: orNull(isNumber),
	factoryMs: orNull(isNumber),
	costUsd: isNumber,
	tokens: isNumber,
	definitions: inSet(DEFINITIONS),
	factoryId: isString
};

const RUN_FIELDS: Record<Exclude<keyof ExportRunLine, 'type'>, Guard> = {
	execution: isString,
	run: isString,
	stage: inSet(STAGES),
	purpose: inSet(PURPOSES),
	returnedFrom: orNull(inSet(STAGES)),
	infrastructureLost: (value) => typeof value === 'boolean',
	passed: (value) => value === null || typeof value === 'boolean',
	tokens: isNumber,
	tokensInput: orNull(isNumber),
	costUsd: isNumber,
	definitions: inSet(DEFINITIONS),
	factoryId: isString
};

/** Copy the validated fields, or name the first one that is missing or mistyped. */
function pick<T>(data: Fields, type: string, fields: Record<string, Guard>): T | string {
	const line: Fields = { type };
	for (const [name, guard] of Object.entries(fields)) {
		if (!Object.hasOwn(data, name)) return `missing ${name}`;
		if (!guard(data[name])) return `invalid ${name}`;
		line[name] = data[name];
	}
	return line as T;
}

type Parsed = { type: 'ticket'; line: ExportTicketLine } | { type: 'run'; line: ExportRunLine };

/** Validate one line's text, or say why it is malformed. */
function parseLine(text: string): Parsed | string {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return 'not JSON';
	}
	if (!isRecord(data)) return 'not an object';
	if (data.type === 'ticket') {
		const line = pick<ExportTicketLine>(data, 'ticket', TICKET_FIELDS);
		return typeof line === 'string' ? line : { type: 'ticket', line };
	}
	if (data.type === 'run') {
		const line = pick<ExportRunLine>(data, 'run', RUN_FIELDS);
		return typeof line === 'string' ? line : { type: 'run', line };
	}
	return 'unknown type';
}

/**
 * An incremental NDJSON export parser. Lines split on `\n` (a trailing `\r`
 * is dropped); blank lines are skipped. `maxLines` bounds the lines read.
 */
export function createStatsExportParser(options: { maxLines?: number } = {}): StatsExportParser {
	const maxLines = options.maxLines ?? Number.POSITIVE_INFINITY;
	let buffer = '';
	let lineNumber = 0;
	let stopped = false;
	const tickets: ExportTicketLine[] = [];
	const runs: ExportRunLine[] = [];
	const executions = new Set<string>();
	const diagnostics: ExportDiagnostic[] = [];
	let envelope: ExportEnvelope | null = null;

	function diagnose(line: number, reason: string) {
		diagnostics.push({ line, reason });
	}

	function accept(parsed: Parsed, line: number) {
		const { factoryId, definitions } = parsed.line;
		if (envelope === null) envelope = { factoryId, definitions };
		else if (envelope.factoryId !== factoryId || envelope.definitions !== definitions) {
			diagnose(line, 'mixed factoryId or definitions');
		}
		if (parsed.type === 'ticket') {
			if (runs.length > 0) diagnose(line, 'ticket line after a run line');
			executions.add(parsed.line.execution);
			tickets.push(parsed.line);
		} else {
			if (!executions.has(parsed.line.execution)) diagnose(line, 'run for an unknown execution');
			runs.push(parsed.line);
		}
	}

	/** One terminated line. Returns false when the bound stops reading. */
	function line(raw: string): boolean {
		lineNumber++;
		// The bound counts every physical line, blank ones included.
		if (lineNumber > maxLines) {
			diagnose(lineNumber, 'line limit reached');
			stopped = true;
			return false;
		}
		const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		if (text.trim() === '') return true;
		const parsed = parseLine(text);
		if (typeof parsed === 'string') diagnose(lineNumber, parsed);
		else accept(parsed, lineNumber);
		return true;
	}

	function result(): StatsExportParse {
		return { tickets, runs, envelope, complete: diagnostics.length === 0, diagnostics };
	}

	function push(text: string): boolean {
		if (stopped) return false;
		buffer += text;
		let start = 0;
		for (let i = buffer.indexOf('\n'); i !== -1; i = buffer.indexOf('\n', start)) {
			const more = line(buffer.slice(start, i));
			start = i + 1;
			if (!more) {
				buffer = '';
				return false;
			}
		}
		buffer = buffer.slice(start);
		return true;
	}

	function end(): StatsExportParse {
		if (!stopped && buffer !== '') {
			// NDJSON may omit the final newline: a fragment that validates is a line.
			// Any non-empty fragment is a physical line for the bound, blank or not.
			const fragment = buffer;
			lineNumber++;
			const text = fragment.endsWith('\r') ? fragment.slice(0, -1) : fragment;
			if (lineNumber > maxLines) diagnose(lineNumber, 'line limit reached');
			else if (text.trim() !== '') {
				const parsed = parseLine(text);
				if (typeof parsed === 'string') diagnose(lineNumber, 'truncated line');
				else accept(parsed, lineNumber);
			}
		}
		buffer = '';
		stopped = true;
		return result();
	}

	function fail(reason: string): StatsExportParse {
		if (!stopped) diagnose(lineNumber + 1, reason);
		buffer = '';
		stopped = true;
		return result();
	}

	return { push, end, fail };
}
