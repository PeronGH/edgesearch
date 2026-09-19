// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';
import { checkResponse, headers, result, type Engine, type EngineResult } from './common';

function destination(href: string): string {
	let url = new URL(decodeHTML(href), 'https://html.duckduckgo.com');
	if ((url.hostname === 'duckduckgo.com' || url.hostname === 'html.duckduckgo.com') && url.pathname === '/l/') {
		url = new URL(url.searchParams.get('uddg')!);
	}
	return url.href;
}

export const duckduckgo: Engine = async (query, signal) => {
	const response = await fetch('https://html.duckduckgo.com/html/', {
		method: 'POST', signal, redirect: 'manual',
		headers: {
			...headers,
			'Referer': 'https://html.duckduckgo.com/html/',
			'Sec-Fetch-Dest': 'document',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Site': 'same-origin',
			'Sec-Fetch-User': '?1',
			'Cookie': 'kl=us-en',
		},
		body: new URLSearchParams({ q: query, b: '', kl: 'us-en' }),
	});
	if (response.status === 303) {
		await response.body?.cancel();
		return [];
	}
	if (response.status === 202) {
		await response.body?.cancel();
		throw new Error('DuckDuckGo HTML search: HTTP 202 (challenge response)');
	}
	await checkResponse(response, 'DuckDuckGo HTML search');
	const results: EngineResult[] = [];
	let current: { title: string; href?: string; snippet: string; inTitle: boolean; hasSnippet: boolean; inSnippet: boolean } | undefined;
	let blocked = false;
	const rewriter = new HTMLRewriter()
		.on('#links > .web-result', {
			element(element) {
				const item = { title: '', href: undefined as string | undefined, snippet: '', inTitle: false, hasSnippet: false, inSnippet: false };
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
		.on('#links > .web-result h2 > a', {
			element(element) {
				if (!current || current.href !== undefined) return;
				const item = current;
				item.href = element.getAttribute('href') ?? '';
				item.inTitle = true;
				element.onEndTag(() => { item.inTitle = false; });
			},
			text(chunk) { if (current?.inTitle) current.title += chunk.text; },
		})
		.on('#links > .web-result a.result__snippet', {
			element(element) {
				if (!current || current.hasSnippet) return;
				const item = current;
				item.hasSnippet = true;
				item.inSnippet = true;
				element.onEndTag(() => { item.inSnippet = false; });
			},
			text(chunk) { if (current?.inSnippet) current.snippet += chunk.text; },
		})
		.on('#challenge-form', { element() { blocked = true; } });
	await rewriter.transform(response).body!.pipeTo(new WritableStream({ write() {} }));
	if (blocked) throw new Error(`DuckDuckGo HTML search: challenge form detected (HTTP ${response.status})`);
	return results;
};
