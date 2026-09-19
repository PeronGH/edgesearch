// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';
import { checkResponse, headers, result, type Engine, type EngineResult } from './common';

async function search(query: string, signal: AbortSignal): Promise<EngineResult[]> {
	const args = new URLSearchParams({
		text: query, lang: 'en', tmpl_version: 'releases', web: '1', frame: '1', searchid: '3131712',
	});
	const response = await fetch(`https://yandex.com/search/site/?${args}`, {
		headers, signal, redirect: 'manual',
	});
	if (response.headers.get('x-yandex-captcha') === 'captcha') {
		await response.body?.cancel();
		throw new Error(`Yandex search: CAPTCHA indicated by x-yandex-captcha header (HTTP ${response.status})`);
	}
	await checkResponse(response, 'Yandex search');
	const results: EngineResult[] = [];
	let current: { title: string; href: string; snippet: string } | undefined;
	const rewriter = new HTMLRewriter()
		.on('li.serp-item', {
			element(element) {
				const parent = current;
				const item = { title: '', href: '', snippet: '' };
				current = item;
				element.onEndTag(() => {
					if (item.href) {
						const url = new URL(decodeHTML(item.href), 'https://yandex.com').href;
						const parsed = result(item.title, url, item.snippet);
						if (parsed) results.push(parsed);
					}
					current = parent;
				});
			},
		})
		.on('li.serp-item a.b-serp-item__title-link', {
			element(element) {
				if (current) current.href = element.getAttribute('href') ?? '';
			},
		})
		.on('li.serp-item h3.b-serp-item__title > a.b-serp-item__title-link > span', {
			text(chunk) { if (current) current.title += chunk.text; },
		})
		.on('li.serp-item div.b-serp-item__content div.b-serp-item__text', {
			text(chunk) { if (current) current.snippet += chunk.text; },
		});
	await rewriter.transform(response).body!.pipeTo(new WritableStream({ write() {} }), { signal });
	return results;
}

export const yandex: Engine = { weight: 1, search };
