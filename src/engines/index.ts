import { bing } from './bing';
import { brave } from './brave';
import { googleCse } from './google-cse';
import type { Engine } from './common';

export type { EngineResult } from './common';

const engines = { bing, brave, google_cse: googleCse } satisfies Record<string, Engine>;
export type EngineName = keyof typeof engines;
export const engineNames = Object.keys(engines) as EngineName[];

export function searchEngine(engine: EngineName, query: string, signal: AbortSignal) {
	return engines[engine](query, signal);
}
