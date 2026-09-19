// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';
import { checkResponse, headers, result, type Engine, type EngineResult } from './common';

function destination(href: string): string {
	let url = new URL(decodeHTML(href), 'https://www.bing.com');
	if (url.hostname === 'www.bing.com' && url.pathname === '/ck/a') {
		const encoded = url.searchParams.get('u');
		if (encoded?.startsWith('a1')) {
			const bytes = Uint8Array.from(atob(encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
			url = new URL(new TextDecoder().decode(bytes));
		}
	}
	return url.href;
}

async function search(query: string, signal: AbortSignal): Promise<EngineResult[]> {
	const response = await fetch(`https://www.bing.com/search?${new URLSearchParams({ q: query, setlang: 'en', adlt: 'off' })}`, {
		headers, signal, redirect: 'manual',
	});
	await checkResponse(response, 'Bing search');
	const results: EngineResult[] = [];
	let current: { title: string; href?: string; snippet: string; inTitle: boolean } | undefined;
	let iconDepth = 0;
	let blocked = false;
	const rewriter = new HTMLRewriter()
		.on('#b_results > li.b_algo', {
			element(element) {
				const item = { title: '', href: undefined as string | undefined, snippet: '', inTitle: false };
				current = item;
				element.onEndTag(() => {
					if (item.href) {
						const parsed = result(item.title, destination(item.href), item.snippet);
						if (parsed) results.push(parsed);
					}
					current = undefined;
				});
			},
		})
		.on('#b_results > li.b_algo h2 > a', {
			element(element) {
				if (!current || current.href !== undefined) return;
				const item = current;
				item.href = element.getAttribute('href') ?? '';
				item.inTitle = true;
				element.onEndTag(() => { item.inTitle = false; });
			},
			text(chunk) { if (current?.inTitle) current.title += chunk.text; },
		})
		.on('#b_results > li.b_algo p', {
			element() { if (current) current.snippet += ' '; },
			text(chunk) { if (current && !iconDepth) current.snippet += chunk.text; },
		})
		.on('#b_results > li.b_algo p span.algoSlug_icon', {
			element(element) {
				iconDepth++;
				element.onEndTag(() => { iconDepth--; });
			},
		});
	for (const selector of ['#b_captcha', '#b_captcha_container', 'iframe[src*="captcha"]']) {
		rewriter.on(selector, { element() { blocked = true; } });
	}
	await rewriter.transform(response).body!.pipeTo(new WritableStream({ write() {} }));
	if (blocked) throw new Error(`Bing search: CAPTCHA detected (HTTP ${response.status})`);
	return results;
}

export const bing: Engine = { weight: 0.5, search };
