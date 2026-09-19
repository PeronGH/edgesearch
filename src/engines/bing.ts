// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';
import { checkResponse, headers, parse, type Engine } from './common';
import { parseHTML } from './html';

export const bing: Engine = async (query, signal) => {
	const response = await fetch(`https://www.bing.com/search?${new URLSearchParams({ q: query, setlang: 'en', adlt: 'moderate' })}`, {
		headers, signal, redirect: 'manual',
	});
	await checkResponse(response);
	return parse(signal, () => parseHTML(response, {
		item: '#b_results > li.b_algo',
		link: 'h2 > a',
		title: 'h2 > a',
		snippet: 'p',
		empty: '.b_no',
		blocked: ['#b_captcha', '#b_captcha_container', 'iframe[src*="captcha"]'],
		ignoreSnippet: 'p span.algoSlug_icon',
		destination(href) {
			let url = new URL(decodeHTML(href), 'https://www.bing.com');
			if (url.hostname === 'www.bing.com' && url.pathname === '/ck/a') {
				const encoded = url.searchParams.get('u');
				if (encoded?.startsWith('a1')) {
					const bytes = Uint8Array.from(atob(encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
					url = new URL(new TextDecoder().decode(bytes));
				}
			}
			return url.href;
		},
	}));
};
