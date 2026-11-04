#!/usr/bin/env node
// Fails when build/ imports anything that is not a relative path or a Node builtin.
// adapter-node externalizes package.json dependencies, so a bare import here would
// be missing from the release tarball, which ships no node_modules.
import { readdir, readFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** @param {string} code @param {number} index */
function lineOf(code, index) {
	let line = 1;
	for (let i = 0; i < index; i++) if (code.charCodeAt(i) === 10) line++;
	return line;
}

/** @param {string} char */
function isIdent(char) {
	return /[A-Za-z0-9_$]/.test(char);
}

/** @param {string} code @param {number} index */
function skipSpace(code, index) {
	while (index < code.length) {
		const char = code[index];
		if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f') {
			index++;
			continue;
		}
		if (char === '/' && code[index + 1] === '/') {
			const next = code.indexOf('\n', index + 2);
			index = next === -1 ? code.length : next + 1;
			continue;
		}
		if (char === '/' && code[index + 1] === '*') {
			const next = code.indexOf('*/', index + 2);
			index = next === -1 ? code.length : next + 2;
			continue;
		}
		break;
	}
	return index;
}

/**
 * @param {string} code
 * @param {number} index
 * @returns {{ value: string, end: number } | null}
 */
function readString(code, index) {
	const quote = code[index];
	if (quote !== "'" && quote !== '"') return null;
	let value = '';
	for (let i = index + 1; i < code.length; i++) {
		const char = code[i];
		if (char === '\\') {
			value += code[i + 1] ?? '';
			i++;
			continue;
		}
		if (char === quote) return { value, end: i + 1 };
		if (char === '\n') return null;
		value += char;
	}
	return null;
}

/**
 * @param {string} code
 * @param {number} index index just after the `import` keyword
 * @returns {{ specifier: string, at: number, end: number } | null}
 */
function readImport(code, index) {
	index = skipSpace(code, index);
	if (code[index] === '.') return null;
	if (code[index] === '(') {
		const spec = readString(code, skipSpace(code, index + 1));
		if (!spec) return null;
		return { specifier: spec.value, at: index, end: spec.end };
	}
	if (code[index] === "'" || code[index] === '"') {
		const spec = readString(code, index);
		if (!spec) return null;
		return { specifier: spec.value, at: index, end: spec.end };
	}
	return readFrom(code, index);
}

/**
 * A re-export: `export { … } from` or `export * from`. Other exports have no specifier.
 * @param {string} code
 * @param {number} index index just after the `export` keyword
 */
function readExportFrom(code, index) {
	index = skipSpace(code, index);
	if (code[index] !== '{' && code[index] !== '*') return null;
	return readFrom(code, index);
}

/** Scan a clause for a top-level `from "specifier"`, stopping at the statement end. */
function readFrom(code, index) {
	let depth = 0;
	while (index < code.length) {
		index = skipSpace(code, index);
		const char = code[index];
		if (char === undefined || char === ';') return null;
		if (char === "'" || char === '"') {
			const spec = readString(code, index);
			index = spec ? spec.end : index + 1;
			continue;
		}
		if (char === '{') {
			depth++;
			index++;
			continue;
		}
		if (char === '}') {
			depth = Math.max(0, depth - 1);
			index++;
			continue;
		}
		if (depth === 0 && code.startsWith('from', index) && !isIdent(code[index + 4] ?? '')) {
			const spec = readString(code, skipSpace(code, index + 4));
			if (!spec) return null;
			return { specifier: spec.value, at: index, end: spec.end };
		}
		if (depth === 0 && (char === '=' || char === '(')) return null;
		index++;
	}
	return null;
}

/**
 * Skip a template literal, scanning the code inside each ${} interpolation.
 * `index` points at the opening backtick. Returns the index after the closing one.
 * @param {string} code
 * @param {number} index
 * @param {{ specifier: string, index: number }[]} found
 */
function skipTemplate(code, index, found) {
	let i = index + 1;
	while (i < code.length) {
		const char = code[i];
		if (char === '\\') {
			i += 2;
			continue;
		}
		if (char === '`') return i + 1;
		if (char === '$' && code[i + 1] === '{') {
			i = scan(code, i + 2, found, true);
			continue;
		}
		i++;
	}
	return i;
}

/**
 * @param {string} code
 * @param {number} start
 * @param {{ specifier: string, index: number }[]} found
 * @param {boolean} inInterpolation stop at the `}` that closes a ${} expression
 * @returns {number}
 */
function scan(code, start, found, inInterpolation) {
	let braces = 0;
	for (let i = start; i < code.length; i++) {
		const char = code[i];
		if (char === '/' && code[i + 1] === '/') {
			const next = code.indexOf('\n', i + 2);
			i = next === -1 ? code.length : next;
			continue;
		}
		if (char === '/' && code[i + 1] === '*') {
			const next = code.indexOf('*/', i + 2);
			i = next === -1 ? code.length : next + 1;
			continue;
		}
		if (char === "'" || char === '"') {
			const spec = readString(code, i);
			i = spec ? spec.end - 1 : i;
			continue;
		}
		if (char === '`') {
			i = skipTemplate(code, i, found) - 1;
			continue;
		}
		if (inInterpolation && char === '{') braces++;
		if (inInterpolation && char === '}') {
			if (braces === 0) return i + 1;
			braces--;
		}
		if (!isIdent(char) || (i > 0 && isIdent(code[i - 1]))) continue;
		const wordStart = i;
		while (i < code.length && isIdent(code[i])) i++;
		const word = code.slice(wordStart, i);
		const read =
			word === 'import' ? readImport(code, i) : word === 'export' ? readExportFrom(code, i) : null;
		if (read) {
			found.push({ specifier: read.specifier, index: wordStart });
			i = read.end - 1;
		} else {
			i--;
		}
	}
	return code.length;
}

/**
 * @param {string} code
 * @returns {{ specifier: string, index: number }[]}
 */
export function moduleSpecifiers(code) {
	/** @type {{ specifier: string, index: number }[]} */
	const found = [];
	scan(code, 0, found, false);
	return found;
}

/** @param {string} specifier */
function isAllowed(specifier) {
	if (specifier.startsWith('./') || specifier.startsWith('../')) return true;
	return isBuiltin(specifier);
}

if (isMain) await scanBuild();

async function scanBuild() {
	let entries;
	try {
		entries = await readdir(buildDir, { recursive: true });
	} catch {
		console.error('build/ is missing. Run pnpm build first.');
		process.exit(1);
	}

	/** @type {string[]} */
	const problems = [];
	for (const entry of entries) {
		if (!entry.endsWith('.js')) continue;
		const path = join(buildDir, entry);
		const code = await readFile(path, 'utf8');
		for (const specifier of moduleSpecifiers(code)) {
			if (isAllowed(specifier.specifier)) continue;
			const where = relative(root, path);
			problems.push(`${where}:${lineOf(code, specifier.index)} imports "${specifier.specifier}"`);
		}
	}

	if (problems.length > 0) {
		console.error('build/ is not self-contained. The release tarball has no node_modules:');
		for (const problem of problems) console.error(`  ${problem}`);
		process.exit(1);
	}

	console.log('build/ has no external imports.');
}
