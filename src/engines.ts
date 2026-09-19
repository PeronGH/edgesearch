// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';

export const engineNames = ['bing', 'duckduckgo'] as const;
export type EngineName = (typeof engineNames)[number];
export type EngineResult = { title: string; url: string; snippets: string[] };
export type ErrorCode = 'blocked' | 'upstream_error' | 'parse_error';

export class EngineError extends Error {
	constructor(public code: ErrorCode) {
		super(code);
	}
}

const selectors = {
	bing: {
		item: '#b_results > li.b_algo',
		title: 'h2 > a',
		snippet: 'p',
		empty: '.b_no',
		blocked: '#b_captcha, #b_captcha_container, iframe[src*="captcha"]',
	},
	duckduckgo: {
		item: '#links > .web-result',
		title: 'h2 > a',
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

function clean(text: string, maxLength: number): string {
	const normalized = decodeHTML(text).replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxLength) return normalized;
	const characters = Array.from(normalized);
	if (characters.length <= maxLength) return normalized;
	const truncated = characters.slice(0, maxLength).join('');
	const lastSpace = truncated.lastIndexOf(' ');
	return (lastSpace < 0 ? truncated : truncated.slice(0, lastSpace)) + ' …';
}

function quoteBangs(query: string): string {
	// Avoid maintaining a bang registry: neutralize every bang-like term.
	return query.split(/\s+/).filter(Boolean).map((term) => term.startsWith('!') ? `'${term}'` : term).join(' ');
}

export async function parseResults(response: Response, engine: EngineName): Promise<EngineResult[]> {
	const config = selectors[engine];
	const results: EngineResult[] = [];
	let current: { title: string; href: string; snippet: string; hasTitle: boolean; inTitle: boolean } | undefined;
	let ignoredSnippetDepth = 0;
	let empty = false;
	let blocked = false;
	const rewriter = new HTMLRewriter()
		.on(config.item, {
			element(element) {
				const item = { title: '', href: '', snippet: '', hasTitle: false, inTitle: false };
				current = item;
				element.onEndTag(() => {
					const title = clean(item.title, 200);
					if (title && item.href) {
						const url = destination(item.href, engine);
						const snippet = clean(item.snippet, 1200);
						if (url) results.push({ title, url, snippets: snippet && snippet !== title ? [snippet] : [] });
					}
					current = undefined;
				});
			},
		})
		.on(`${config.item} ${config.title}`, {
			element(element) {
				if (!current || current.hasTitle) return;
				const item = current;
				item.hasTitle = true;
				item.inTitle = true;
				item.href = element.getAttribute('href') ?? '';
				element.onEndTag(() => { item.inTitle = false; });
			},
			text(chunk) {
				if (current?.inTitle) current.title += chunk.text;
			},
		})
		.on(`${config.item} ${config.snippet}`, {
			element() {
				if (current) current.snippet += ' ';
			},
			text(chunk) {
				if (current && !ignoredSnippetDepth) current.snippet += chunk.text;
			},
		})
		.on(config.empty, { element() { empty = true; } });
	if (engine === 'bing') {
		rewriter.on(`${config.item} p span.algoSlug_icon`, {
			element(element) {
				ignoredSnippetDepth++;
				element.onEndTag(() => { ignoredSnippetDepth--; });
			},
		});
	}
	for (const selector of config.blocked.split(', ')) {
		rewriter.on(selector, { element() { blocked = true; } });
	}
	// Drain the transformed stream to run handlers without buffering the HTML.
	await rewriter.transform(response).body!.pipeTo(new WritableStream({ write() {} }));
	if (blocked) throw new EngineError('blocked');
	if (!results.length && !empty) throw new EngineError('parse_error');
	return results;
}

export async function searchEngine(engine: EngineName, query: string): Promise<EngineResult[]> {
	const headers = {
		'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
		'Accept': 'text/html',
		'Accept-Language': 'en-US,en;q=0.9',
	};
	const response = engine === 'bing'
		? await fetch(`https://www.bing.com/search?${new URLSearchParams({ q: query, setlang: 'en', adlt: 'moderate' })}`, { headers, redirect: 'manual' })
		: await fetch('https://html.duckduckgo.com/html/', {
			method: 'POST', redirect: 'manual',
			headers: {
				...headers,
				'Referer': 'https://html.duckduckgo.com/html/',
				'Sec-Fetch-Dest': 'document',
				'Sec-Fetch-Mode': 'navigate',
				'Sec-Fetch-Site': 'same-origin',
				'Sec-Fetch-User': '?1',
				'Cookie': 'kl=us-en',
			},
			body: new URLSearchParams({ q: quoteBangs(query), b: '', kl: 'us-en' }),
		});
	if (engine === 'duckduckgo' && response.status === 303) {
		await response.body?.cancel();
		return [];
	}
	if (!response.ok || response.status === 202) {
		await response.body?.cancel();
		throw new EngineError([202, 403, 429].includes(response.status) ? 'blocked' : 'upstream_error');
	}
	try {
		return await parseResults(response, engine);
	} catch (error) {
		if (error instanceof EngineError) throw error;
		throw new EngineError('parse_error');
	}
}
