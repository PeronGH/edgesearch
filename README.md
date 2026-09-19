# EdgeSearch

A small Workers-native web search API and GUI. Queries search engines concurrently, extracts HTML results with HTMLRewriter and CSE results from JSONP, and merges matching URLs using reciprocal-rank fusion. No database or API keys required.

## Run

```sh
bun install
bun run dev
```

Open http://localhost:8787 or call:

```sh
curl 'http://localhost:8787/api/v1/search?q=cloudflare+workers'
```

`GET /api/v1/search` accepts a nonempty `q` and an optional comma-separated `engines` selection: `bing`, `duckduckgo`, `brave`, `google_cse`. All four run by default. Results contain `title`, `url`, `snippets` (plain-text strings), and `engines`.

```json
{
  "query": "example",
  "results": [
    {
      "title": "Example",
      "url": "https://example.com/",
      "snippets": ["An example website."],
      "engines": ["bing"]
    }
  ],
  "partial": false,
  "engine_errors": []
}
```

Search waits for all selected engines without an application-level timeout. Successful engines still return results when another fails. Invalid input returns 400; failure of every selected engine returns 502. Engine failures are reported in `engine_errors`, preserving exception messages. An empty search returns 200 with no results.

Google CSE uses the same public Blackle CSE ID as SearXNG, not the official API. Its bootstrap token is cached in memory for one hour per Worker isolate; a cold or expired cache requires an extra request. Availability depends on that third-party CSE configuration.

First-page English/US-oriented web results only; no pagination, images, answers, or destination-page fetching. Providers may block Cloudflare IPs or change their markup. All merged first-page results are returned without a result-count limit.

## Deploy

```sh
bun run deploy
```

The endpoint is public and unauthenticated: restrict deployment access externally if needed. Do not put private credentials in the static GUI. Search terms are sent to the selected providers and may appear in platform request logs.

The implementation targets Workers Free, but deployed CPU usage and provider availability must be measured before relying on it. Local development does not establish either. No paid bindings are required.

## License

[AGPL-3.0-or-later](LICENSE). Adapted from [SearXNG](https://github.com/searxng/searxng).
