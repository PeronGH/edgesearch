import { engines as engineRegistry, searchEngine, type EngineName, type EngineResult } from './engines';

export type SearchResult = EngineResult & { engines: EngineName[] };

function keyFor(href: string): string {
	const url = new URL(href);
	for (const key of [...url.searchParams.keys()]) {
		if (key.startsWith('utm_') || key === 'gclid' || key === 'fbclid') url.searchParams.delete(key);
	}
	return url.href;
}

export function mergeResults(groups: { engine: EngineName; results: EngineResult[] }[]): SearchResult[] {
	const merged = new Map<string, { result: SearchResult; score: number }>();
	for (const { engine, results } of groups) {
		const seen = new Set<string>();
		results.forEach((result, index) => {
			const key = keyFor(result.url);
			if (seen.has(key)) return;
			seen.add(key);
			const existing = merged.get(key);
			const weight = engineRegistry[engine].weight;
			const score = weight / (6 + index + 1);
			if (existing) {
				existing.score += score;
				existing.result.engines.push(engine);
				existing.result.snippets = [...new Set([...existing.result.snippets, ...result.snippets])];
			} else {
				merged.set(key, { result: { ...result, url: key, snippets: [...result.snippets], engines: [engine] }, score });
			}
		});
	}
	return [...merged.values()].sort((a, b) => b.score - a.score).map(({ result }) => result);
}

export async function search(query: string, engines: EngineName[], signal: AbortSignal) {
	const outcomes = await Promise.all(engines.map(async (engine) => {
		try {
			return { engine, results: await searchEngine(engine, query, signal) };
		} catch (error) {
			signal.throwIfAborted();
			return { engine, error: error instanceof Error ? error.message : String(error) };
		}
	}));
	const successful = outcomes.flatMap((outcome) => outcome.results ? [{ engine: outcome.engine, results: outcome.results }] : []);
	const errors = outcomes.filter((outcome) => outcome.error !== undefined).map(({ engine, error }) => ({ engine, error }));
	return {
		status: successful.length ? 200 : 502,
		body: {
			query,
			results: mergeResults(successful),
			partial: errors.length > 0,
			engine_errors: errors,
		},
	};
}
