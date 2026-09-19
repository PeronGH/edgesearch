import { engineNames, type EngineName } from './engines';
import { search } from './search';

export default {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname !== '/api/v1/search') return Response.json({ error: 'Not found' }, { status: 404 });
		if (request.method !== 'GET') return Response.json({ error: 'Use GET' }, { status: 405, headers: { Allow: 'GET' } });
		const query = url.searchParams.get('q')?.trim();
		const engines = [...new Set(url.searchParams.get('engines')?.split(',') ?? engineNames)];
		if (!query) return Response.json({ error: 'q is required' }, { status: 400 });
		if (engines.some((engine) => !engineNames.includes(engine as EngineName))) {
			return Response.json({ error: `engines must be a comma-separated selection of ${engineNames.join(',')}` }, { status: 400 });
		}
		const { body, status } = await search(query, engines as EngineName[], request.signal);
		return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
	},
} satisfies ExportedHandler<Env>;
