import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './markdown';

/** Every element in the output with its attributes, read the way a browser would. */
function elements(html: string): { tag: string; attrs: Record<string, string> }[] {
	const found: { tag: string; attrs: Record<string, string> }[] = [];
	for (const tag of html.matchAll(
		/<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>]+(?:="[^"]*"|='[^']*'|=[^\s>]+)?)*)\s*\/?>/g
	)) {
		const attrs: Record<string, string> = {};
		for (const attr of (tag[2] ?? '').matchAll(
			/([^\s=>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
		)) {
			attrs[(attr[1] ?? '').toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? '';
		}
		found.push({ tag: (tag[1] ?? '').toLowerCase(), attrs });
	}
	return found;
}

/** No live script, event handler or dangerous URL scheme in the output. */
function expectSafe(html: string) {
	for (const { tag, attrs } of elements(html)) {
		expect(['script', 'iframe', 'object', 'embed', 'svg', 'style']).not.toContain(tag);
		for (const [name, value] of Object.entries(attrs)) {
			expect(name).not.toMatch(/^on/);
			if (name === 'href' || name === 'src') expect(value).toMatch(/^(https?:|mailto:)/);
		}
	}
	expect(html).not.toMatch(/(href|src)\s*=\s*"?\s*(javascript|data|vbscript):/i);
}

describe('renderMarkdown: normal markdown', () => {
	it('renders headings, lists, code and inline formatting', () => {
		const html = renderMarkdown(
			[
				'## Steps',
				'',
				'- one',
				'- **two**',
				'',
				'1. first',
				'',
				'Use `pnpm test` here.',
				'',
				'```ts',
				'const a = 1 < 2;',
				'```'
			].join('\n')
		);
		expect(html).toContain('<h2>Steps</h2>');
		expect(html).toContain('<ul>');
		expect(html).toContain('<li><strong>two</strong></li>');
		expect(html).toContain('<ol>');
		expect(html).toContain('<code>pnpm test</code>');
		expect(html).toContain('<pre><code class="language-ts">const a = 1 &lt; 2;');
	});

	it('renders safe links that open in a new tab', () => {
		const html = renderMarkdown(
			'See [the issue](https://github.com/dpaez/factory-dashboard/issues/24) or [mail](mailto:ops@example.com).'
		);
		expect(html).toContain(
			'<a href="https://github.com/dpaez/factory-dashboard/issues/24" rel="noopener noreferrer nofollow" target="_blank">the issue</a>'
		);
		expect(html).toContain(
			'<a href="mailto:ops@example.com" rel="noopener noreferrer nofollow" target="_blank">mail</a>'
		);
	});

	it('renders bare GFM URLs as safe links', () => {
		const html = renderMarkdown('Visit https://example.com/a now');
		expect(html).toContain(
			'<a href="https://example.com/a" rel="noopener noreferrer nofollow" target="_blank">https://example.com/a</a>'
		);
	});

	it('keeps https images', () => {
		const html = renderMarkdown('![diagram](https://example.com/d.png)');
		expect(html).toContain('<img src="https://example.com/d.png" alt="diagram">');
	});
});

describe('renderMarkdown: XSS payloads', () => {
	it('the safety check itself catches unsafe markup', () => {
		expect(() => expectSafe('<img src=x onerror="alert(1)">')).toThrow();
		expect(() => expectSafe('<a href="javascript:alert(1)">x</a>')).toThrow();
		expect(() => expectSafe('<script>alert(1)</script>')).toThrow();
	});

	it('escapes a <script> block', () => {
		const html = renderMarkdown('<script>alert(1)</script>');
		expectSafe(html);
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
	});

	it('escapes inline <img onerror>', () => {
		const html = renderMarkdown('Look <img src=x onerror="alert(1)"> here');
		expectSafe(html);
		expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
	});

	it('escapes raw HTML blocks', () => {
		const html = renderMarkdown(
			'<div onclick="alert(1)">\n<iframe src="javascript:alert(1)"></iframe>\n</div>'
		);
		expectSafe(html);
		expect(html).toContain('&lt;div onclick=');
	});

	it('renders a javascript: link as text', () => {
		const html = renderMarkdown('[click](javascript:alert(1))');
		expectSafe(html);
		expect(html).not.toContain('<a');
		expect(html).toContain('click');
	});

	it('renders an obfuscated javascript: link as text', () => {
		const html = renderMarkdown('[x](JaVaScRiPt:alert(1)) [y](  javascript&#58;alert(1))');
		expectSafe(html);
		expect(html).not.toContain('<a');
	});

	it('renders a data: link and a data: image as text', () => {
		const html = renderMarkdown(
			'[doc](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)\n\n![pic](data:image/svg+xml,<svg onload=alert(1)>)'
		);
		expectSafe(html);
		expect(html).not.toContain('<a');
		expect(html).not.toContain('<img');
	});

	it('refuses relative links', () => {
		const html = renderMarkdown('[rel](/admin)');
		expect(html).not.toContain('<a');
	});

	it('escapes quotes in link titles', () => {
		const html = renderMarkdown('[t](https://example.com "a\\" onmouseover=\\"x")');
		expectSafe(html);
		expect(html).toContain('title="a&quot; onmouseover=&quot;x"');
	});
});
