import { EngineError, searchEngine, type EngineName, type EngineResult, type ErrorCode } from './engines';

export type SearchResult = EngineResult & { engines: EngineName[] };

function keyFor(href: string): string {
	const url = new URL(href);
	for (const key of [...url.searchParams.keys()]) {
		if (key.startsWith('utm_') || key === 'gclid' || key === 'fbclid') url.searchParams.delete(key);
	}
	return url.href;
}

export function mergeResults(groups: { engine: EngineName; results: EngineResult[] }[], limit: number): SearchResult[] {
	const merged = new Map<string, { result: SearchResult; score: number }>();
	for (const { engine, results } of groups) {
		const seen = new Set<string>();
		results.forEach((result, index) => {
			const key = keyFor(result.url);
			if (seen.has(key)) return;
			seen.add(key);
			const existing = merged.get(key);
			const score = 1 / (60 + index + 1);
			if (existing) {
				existing.score += score;
				existing.result.engines.push(engine);
				existing.result.snippets = [...new Set([...existing.result.snippets, ...result.snippets])];
			} else {
				merged.set(key, { result: { ...result, url: key, snippets: [...result.snippets], engines: [engine] }, score });
			}
		});
	}
	return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit).map(({ result }) => result);
}

export async function search(query: string, engines: EngineName[], limit: number) {
	const outcomes = await Promise.all(engines.map(async (engine) => {
		try {
			return { engine, results: await searchEngine(engine, query) };
		} catch (error) {
			const code: ErrorCode = error instanceof EngineError ? error.code : 'upstream_error';
			return { engine, error: code };
		}
	}));
	const successful = outcomes.flatMap((outcome) => outcome.results ? [{ engine: outcome.engine, results: outcome.results }] : []);
	const errors = outcomes.filter((outcome) => outcome.error !== undefined).map(({ engine, error }) => ({ engine, error }));
	return {
		status: successful.length ? 200 : 502,
		body: {
			query,
			results: mergeResults(successful, limit),
			partial: errors.length > 0,
			engine_errors: errors,
		},
	};
}
