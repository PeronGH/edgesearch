// SPDX-License-Identifier: AGPL-3.0-or-later
import { checkResponse, headers, result, type Engine, type EngineResult } from './common';

interface YepResult {
	url: string;
	title: string;
	snippet: string;
}

async function snippetText(html: string, signal: AbortSignal): Promise<string> {
	let text = '';
	let ignored = 0;
	const rewriter = new HTMLRewriter().onDocument({
		text(chunk) { if (!ignored) text += chunk.text; },
	});
	for (const selector of ['script', 'style']) {
		rewriter.on(selector, {
			element(element) {
				ignored++;
				element.onEndTag(() => { ignored--; });
			},
		});
	}
	await rewriter.transform(new Response(html)).body!.pipeTo(new WritableStream({ write() {} }), { signal });
	return text;
}

async function search(query: string, signal: AbortSignal): Promise<EngineResult[]> {
	const args = new URLSearchParams({ query, safeSearch: 'moderate', limit: '20', hl: 'en' });
	const response = await fetch(`https://api.yep.com/search?${args}`, {
		signal, redirect: 'manual',
		headers: { ...headers, Accept: 'application/json', Referer: 'https://yep.com/', Origin: 'https://yep.com' },
	});
	await checkResponse(response, 'Yep search');
	const data = await response.json<[unknown, { results: YepResult[] }]>();
	const results: EngineResult[] = [];
	for (const item of data[1].results) {
		const parsed = result(item.title, item.url, await snippetText(item.snippet, signal));
		if (parsed) results.push(parsed);
	}
	return results;
}

export const yep: Engine = { weight: 1, search };
