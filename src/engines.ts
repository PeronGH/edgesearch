// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';

export const engineNames = ['bing', 'duckduckgo'] as const;
export type EngineName = (typeof engineNames)[number];
export type EngineResult = { title: string; url: string; snippets: string[] };
export type ErrorCode = 'blocked' | 'upstream_error' | 'parse_error' | 'timeout';

export class EngineError extends Error {
	constructor(public code: ErrorCode) {
		super(code);
	}
}

const selectors = {
	bing: {
		item: '#b_results > li.b_algo',
		title: 'h2 a',
		snippet: 'p',
		empty: '.b_no',
		blocked: '#b_captcha, #b_captcha_container, iframe[src*="captcha"]',
	},
	duckduckgo: {
		item: '#links > .web-result',
		title: 'h2 a',
		snippet: '.result__snippet',
		empty: '.no-results',
		blocked: '#challenge-form',
	},
};

function destination(href: string, engine: EngineName): string {
	let url = new URL(decodeHTML(href), engine === 'bing' ? 'https://www.bing.com' : 'https://html.duckduckgo.com');
	if (engine === 'duckduckgo' && (url.hostname === 'duckduckgo.com' || url.hostname === 'html.duckduckgo.com') && url.pathname === '/l/') {
		url = new URL(url.searchParams.get('uddg')!);
	}
	if (engine === 'bing' && url.hostname === 'www.bing.com' && url.pathname === '/ck/a') {
		const encoded = url.searchParams.get('u');
		if (encoded?.startsWith('a1')) {
			const bytes = Uint8Array.from(atob(encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
			url = new URL(new TextDecoder().decode(bytes));
		}
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
	return url.href;
}

const clean = (text: string) => decodeHTML(text).replace(/\s+/g, ' ').trim();

export async function parseResults(response: Response, engine: EngineName): Promise<EngineResult[]> {
	const config = selectors[engine];
	const results: EngineResult[] = [];
	let current: { title: string; href: string; snippet: string } | undefined;
	let empty = false;
	let blocked = false;
	const rewriter = new HTMLRewriter()
		.on(config.item, {
			element(element) {
				const item = { title: '', href: '', snippet: '' };
				current = item;
				element.onEndTag(() => {
					const title = clean(item.title);
					if (title && item.href) {
						const url = destination(item.href, engine);
						const snippet = clean(item.snippet);
						if (url) results.push({ title, url, snippets: snippet ? [snippet] : [] });
					}
					current = undefined;
				});
			},
		})
		.on(`${config.item} ${config.title}`, {
			element(element) {
				if (current) current.href = element.getAttribute('href') ?? '';
			},
			text(chunk) {
				if (current) current.title += chunk.text;
			},
		})
		.on(`${config.item} ${config.snippet}`, {
			element() {
				if (current) current.snippet += ' ';
			},
			text(chunk) {
				if (current) current.snippet += chunk.text;
			},
		})
		.on(config.empty, { element() { empty = true; } });
	for (const selector of config.blocked.split(', ')) {
		rewriter.on(selector, { element() { blocked = true; } });
	}
	// Drain the transformed stream to run handlers without buffering the HTML.
	await rewriter.transform(response).body!.pipeTo(new WritableStream({ write() {} }));
	if (blocked) throw new EngineError('blocked');
	if (!results.length && !empty) throw new EngineError('parse_error');
	return results;
}

export async function searchEngine(engine: EngineName, query: string, signal: AbortSignal): Promise<EngineResult[]> {
	const headers = {
		'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
		'Accept': 'text/html',
		'Accept-Language': 'en-US,en;q=0.9',
	};
	const response = engine === 'bing'
		? await fetch(`https://www.bing.com/search?${new URLSearchParams({ q: query, setlang: 'en', adlt: 'moderate' })}`, { headers, signal })
		: await fetch('https://html.duckduckgo.com/html/', {
			method: 'POST', headers, signal,
			body: new URLSearchParams({ q: query, b: '', kl: 'us-en' }),
		});
	if (!response.ok || response.status === 202) {
		await response.body?.cancel();
		throw new EngineError([202, 403, 429].includes(response.status) ? 'blocked' : 'upstream_error');
	}
	try {
		return await parseResults(response, engine);
	} catch (error) {
		if (signal.aborted || error instanceof EngineError) throw error;
		throw new EngineError('parse_error');
	}
}
