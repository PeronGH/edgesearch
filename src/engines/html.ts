// SPDX-License-Identifier: AGPL-3.0-or-later
import { EngineError, result, type EngineResult } from './common';

interface Selectors {
	item: string;
	link: string;
	title: string;
	snippet: string;
	empty?: string;
	blocked: string[];
	ignoreSnippet?: string;
	firstSnippet?: boolean;
	cleanSnippet?: (text: string) => string;
	destination: (href: string) => string;
}

export async function parseHTML(response: Response, config: Selectors): Promise<EngineResult[]> {
	const results: EngineResult[] = [];
	let current: {
		title: string; href: string; snippet: string;
		hasTitle: boolean; inTitle: boolean; hasLink: boolean;
		hasSnippet: boolean; inSnippet: boolean;
	} | undefined;
	let ignoredSnippetDepth = 0;
	let empty = !config.empty;
	let blocked = false;
	const rewriter = new HTMLRewriter()
		.on(config.item, {
			element(element) {
				const parent = current;
				const item = { title: '', href: '', snippet: '', hasTitle: false, inTitle: false, hasLink: false, hasSnippet: false, inSnippet: false };
				current = item;
				element.onEndTag(() => {
					if (item.title && item.href) {
						const snippet = config.cleanSnippet ? config.cleanSnippet(item.snippet) : item.snippet;
						const parsed = result(item.title, config.destination(item.href), snippet);
						if (parsed) results.push(parsed);
					}
					current = parent;
				});
			},
		})
		.on(`${config.item} ${config.link}`, {
			element(element) {
				if (!current || current.hasLink) return;
				current.hasLink = true;
				current.href = element.getAttribute('href') ?? '';
			},
		})
		.on(`${config.item} ${config.title}`, {
			element(element) {
				if (!current || current.hasTitle) return;
				const item = current;
				item.hasTitle = true;
				item.inTitle = true;
				element.onEndTag(() => { item.inTitle = false; });
			},
			text(chunk) {
				if (current?.inTitle) current.title += chunk.text;
			},
		})
		.on(`${config.item} ${config.snippet}`, {
			element(element) {
				if (!current || (config.firstSnippet && current.hasSnippet)) return;
				const item = current;
				item.hasSnippet = true;
				item.inSnippet = true;
				item.snippet += ' ';
				element.onEndTag(() => { item.inSnippet = false; });
			},
			text(chunk) {
				if (current?.inSnippet && !ignoredSnippetDepth) current.snippet += chunk.text;
			},
		});
	if (config.empty) rewriter.on(config.empty, { element() { empty = true; } });
	if (config.ignoreSnippet) {
		rewriter.on(`${config.item} ${config.ignoreSnippet}`, {
			element(element) {
				ignoredSnippetDepth++;
				element.onEndTag(() => { ignoredSnippetDepth--; });
			},
		});
	}
	for (const selector of config.blocked) {
		rewriter.on(selector, { element() { blocked = true; } });
	}
	// Drain the transformed stream to run handlers without buffering the HTML.
	await rewriter.transform(response).body!.pipeTo(new WritableStream({ write() {} }));
	if (blocked) throw new EngineError('blocked');
	if (!results.length && !empty) throw new EngineError('parse_error');
	return results;
}
