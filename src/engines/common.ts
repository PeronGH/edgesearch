// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeHTML } from 'entities';

export type EngineResult = { title: string; url: string; snippets: string[] };
export type ErrorCode = 'blocked' | 'upstream_error' | 'parse_error';
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
	if (!response.ok || response.status === 202) {
		await response.body?.cancel();
		throw new EngineError([202, 403, 429].includes(response.status) ? 'blocked' : 'upstream_error');
	}
}

export async function parse<T>(signal: AbortSignal, callback: () => Promise<T>): Promise<T> {
	try {
		return await callback();
	} catch (error) {
		signal.throwIfAborted();
		if (error instanceof EngineError) throw error;
		throw new EngineError('parse_error');
	}
}

function clean(text: string, maxLength: number): string {
	const normalized = decodeHTML(text).replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxLength) return normalized;
	const characters = Array.from(normalized);
	if (characters.length <= maxLength) return normalized;
	const truncated = characters.slice(0, maxLength).join('');
	const lastSpace = truncated.lastIndexOf(' ');
	return (lastSpace < 0 ? truncated : truncated.slice(0, lastSpace)) + ' …';
}

export function result(title: string, url: string, snippet: string): EngineResult | undefined {
	if (!url) return;
	const destination = new URL(url);
	if (destination.protocol !== 'https:' && destination.protocol !== 'http:') return;
	title = clean(title, 200);
	if (!title) return;
	snippet = clean(snippet, 1200);
	return { title, url: destination.href, snippets: snippet && snippet !== title ? [snippet] : [] };
}
