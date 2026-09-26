// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';
import { checkResponse, headers, result, type Engine, type EngineResult } from './common';
import { fetch } from '../fetch';

async function search(query: string, signal: AbortSignal): Promise<EngineResult[]> {
	const response = await fetch(`https://search.brave.com/search?${new URLSearchParams({ q: query, source: 'web' })}`, {
		signal, redirect: 'manual',
		headers: {
			...headers,
			'Accept-Encoding': 'gzip, deflate',
			'Cookie': 'safesearch=off; useLocation=0; summarizer=0; country=us; ui_lang=en-us',
		},
	});
	await checkResponse(response, 'Brave search');
	const results: EngineResult[] = [];
	let current: { title: string; href?: string; snippet: string; hasTitle: boolean; inTitle: boolean; hasSnippet: boolean; inSnippet: boolean } | undefined;
	let dateDepth = 0;
	let blocked = false;
	const rewriter = new HTMLRewriter()
		.on('div.snippet', {
			element(element) {
				const parent = current;
				const item = { title: '', href: undefined as string | undefined, snippet: '', hasTitle: false, inTitle: false, hasSnippet: false, inSnippet: false };
				current = item;
				element.onEndTag(() => {
					const href = decodeHTML(item.href ?? '');
					// Relative URLs in Brave's result containers are typically ads.
					if (/^(https?:)?\/\//i.test(href)) {
						const parsed = result(item.title, new URL(href, 'https://search.brave.com').href, item.snippet.replace(/^[\s-]+/, ''));
						if (parsed) results.push(parsed);
					}
					current = parent;
				});
			},
		})
		.on('div.snippet a', {
			element(element) {
				if (current && current.href === undefined) current.href = element.getAttribute('href') ?? '';
			},
		})
		.on('div.snippet div[class*="title"]', {
			element(element) {
				if (!current || current.hasTitle) return;
				const item = current;
				item.hasTitle = true;
				item.inTitle = true;
				element.onEndTag(() => { item.inTitle = false; });
			},
			text(chunk) { if (current?.inTitle) current.title += chunk.text; },
		})
		.on('div.snippet div.content', {
			element(element) {
				if (!current || current.hasSnippet) return;
				const item = current;
				item.hasSnippet = true;
				item.inSnippet = true;
				element.onEndTag(() => { item.inSnippet = false; });
			},
			text(chunk) { if (current?.inSnippet && !dateDepth) current.snippet += chunk.text; },
		})
		.on('div.snippet div.content span[class*="t-secondary"]', {
			element(element) {
				dateDepth++;
				element.onEndTag(() => { dateDepth--; });
			},
		});
	for (const selector of ['form[action*="captcha"]', '#challenge-form']) {
		rewriter.on(selector, { element() { blocked = true; } });
	}
	await rewriter.transform(response).body!.pipeTo(new WritableStream({ write() {} }));
	if (blocked) throw new Error(`Brave search: CAPTCHA/challenge form detected (HTTP ${response.status})`);
	return results;
}

export const brave: Engine = { weight: 1, search };
