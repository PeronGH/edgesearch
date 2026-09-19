// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';
import { checkResponse, headers, parse, type Engine } from './common';
import { parseHTML } from './html';

export const duckduckgo: Engine = async (query, signal) => {
	// Avoid maintaining a bang registry: neutralize every bang-like term.
	query = query.split(/\s+/).filter(Boolean).map((term) => term.startsWith('!') ? `'${term}'` : term).join(' ');
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
	await checkResponse(response);
	return parse(signal, () => parseHTML(response, {
		item: '#links > .web-result',
		link: 'h2 > a',
		title: 'h2 > a',
		snippet: 'a.result__snippet',
		firstSnippet: true,
		empty: '.no-results',
		blocked: ['#challenge-form'],
		destination(href) {
			let url = new URL(decodeHTML(href), 'https://html.duckduckgo.com');
			if ((url.hostname === 'duckduckgo.com' || url.hostname === 'html.duckduckgo.com') && url.pathname === '/l/') {
				url = new URL(url.searchParams.get('uddg')!);
			}
			return url.href;
		},
	}));
};
