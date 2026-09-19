// SPDX-License-Identifier: AGPL-3.0-or-later
import { checkResponse, headers, result, type Engine, type EngineResult } from './common';

const cx = 'partner-pub-8993703457585266:4862972284';
interface Token {
	cse_tok: string;
	cselibv: string;
	exp: string;
	expires: number;
}
let cachedToken: Token | undefined;

async function getToken(signal: AbortSignal): Promise<Token> {
	if (cachedToken && cachedToken.expires > Date.now()) return cachedToken;
	const response = await fetch(`https://www.google.com/cse/cse.js?${new URLSearchParams({ cx })}`, {
		headers, signal, redirect: 'manual',
	});
	await checkResponse(response);
	const text = await response.text();
	const options = JSON.parse(text.slice(text.lastIndexOf('({') + 1, text.lastIndexOf('});') + 1)) as {
		cse_token?: string;
		cselibVersion?: string;
		exp?: string[];
	};
	if (!options.cse_token) throw new Error('Google CSE bootstrap response has no cse_token');
	const token = {
		cse_tok: options.cse_token,
		cselibv: options.cselibVersion ?? '',
		exp: options.exp?.join(',') ?? '',
		expires: Date.now() + 3_600_000,
	};
	// Cache only resolved data: requests must not share cancellation or live I/O.
	cachedToken = token;
	return token;
}

interface SearchResponse {
	error?: { code?: number; message?: string };
	results?: { unescapedUrl?: string; titleNoFormatting?: string; contentNoFormatting?: string }[];
}

export const googleCse: Engine = async (query, signal) => {
	const token = await getToken(signal);
	const args = new URLSearchParams({
		rsz: 'filtered_cse', num: '20', hl: 'en', gl: 'US',
		cselibv: token.cselibv, cx, q: query, safe: 'medium',
		cse_tok: token.cse_tok, callback: '_', rurl: '', searchtype: '',
	});
	if (token.exp) args.set('exp', token.exp);
	const response = await fetch(`https://cse.google.com/cse/element/v1?${args}`, {
		signal, redirect: 'manual',
		headers: { ...headers, Accept: '*/*', Referer: 'https://cse.google.com/', Cookie: 'CONSENT=YES+' },
	});
	await checkResponse(response);
	const text = await response.text();
	const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as SearchResponse;
	if (data.error) throw new Error(data.error.message ?? `Google CSE error ${data.error.code}`);
	const results: EngineResult[] = [];
	for (const item of data.results ?? []) {
		const parsed = result(item.titleNoFormatting ?? '', item.unescapedUrl ?? '', item.contentNoFormatting ?? '');
		if (parsed) results.push(parsed);
	}
	return results;
};
