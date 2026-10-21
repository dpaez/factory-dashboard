/**
 * The one markdown renderer: tracker text in, safe HTML out. Pure and
 * browser-safe (no DOM), so it runs the same during SSR and in the browser.
 *
 * - Raw HTML, block or inline, is escaped and shown as text, never passed through.
 * - Links and images keep only absolute `http:`, `https:` and `mailto:` URLs;
 *   any other URL renders as its text.
 * - Links open in a new tab with `rel="noopener noreferrer nofollow"`.
 *
 * Its output is the only string the app renders with `{@html}`.
 */
import { Marked, type Tokens } from 'marked';

const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:']);

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** The URL when its protocol is allowed, else null. Relative URLs are refused. */
function safeUrl(href: string): string | null {
	try {
		const url = new URL(href.trim());
		return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

const marked = new Marked({
	gfm: true,
	async: false,
	renderer: {
		html({ text }: Tokens.HTML | Tokens.Tag): string {
			return escapeHtml(text);
		},
		link({ href, title, tokens }: Tokens.Link): string {
			const text = this.parser.parseInline(tokens);
			const url = safeUrl(href);
			if (url === null) return text;
			const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
			return `<a href="${escapeHtml(url)}"${titleAttr} rel="noopener noreferrer nofollow" target="_blank">${text}</a>`;
		},
		image({ href, title, text }: Tokens.Image): string {
			const url = safeUrl(href);
			if (url === null) return escapeHtml(text);
			const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
			return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text)}"${titleAttr}>`;
		}
	}
});

/** Render tracker markdown to sanitized HTML. */
export function renderMarkdown(source: string): string {
	return marked.parse(source, { async: false });
}
