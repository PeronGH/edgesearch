// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';

export type EngineResult = { title: string; url: string; snippets: string[] };
export type ErrorCode = 'blocked' | 'upstream_error';
export type Engine = (query: string, signal: AbortSignal) => Promise<EngineResult[]>;

export class EngineError extends Error {
	constructor(public code: ErrorCode) {
		super(code);
	}
}

export const headers = {
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
	'Accept': 'text/html',
	'Accept-Language': 'en-US,en;q=0.9',
};

export async function checkResponse(response: Response): Promise<void> {
	if (!response.ok) {
		await response.body?.cancel();
		throw new EngineError([403, 429].includes(response.status) ? 'blocked' : 'upstream_error');
	}
}

const clean = (text: string) => decodeHTML(text).replace(/\s+/g, ' ').trim();

export function result(title: string, url: string, snippet: string): EngineResult | undefined {
	if (!url) return;
	const destination = new URL(url);
	if (destination.protocol !== 'https:' && destination.protocol !== 'http:') return;
	title = clean(title);
	if (!title) return;
	snippet = clean(snippet);
	return { title, url: destination.href, snippets: snippet && snippet !== title ? [snippet] : [] };
}
