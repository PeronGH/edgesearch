// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';
import { checkResponse, headers, parse, type Engine } from './common';
import { parseHTML } from './html';

export const brave: Engine = async (query, signal) => {
	const response = await fetch(`https://search.brave.com/search?${new URLSearchParams({ q: query, source: 'web' })}`, {
		signal, redirect: 'manual',
		headers: {
			...headers,
			'Accept-Encoding': 'gzip, deflate',
			'Cookie': 'safesearch=moderate; useLocation=0; summarizer=0; country=us; ui_lang=en-us',
		},
	});
	await checkResponse(response);
	return parse(signal, () => parseHTML(response, {
		item: 'div.snippet',
		link: 'a',
		title: 'div[class*="title"]',
		snippet: 'div.content',
		firstSnippet: true,
		blocked: ['form[action*="captcha"]', '#challenge-form'],
		ignoreSnippet: 'div.content span[class*="t-secondary"]',
		cleanSnippet: (text) => text.replace(/^[\s-]+/, ''),
		destination(href) {
			href = decodeHTML(href);
			// Relative URLs in Brave's result containers are typically ads.
			if (!/^(https?:)?\/\//i.test(href)) return '';
			return new URL(href, 'https://search.brave.com').href;
		},
	}));
};
