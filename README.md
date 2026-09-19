# EdgeSearch

A web search JSON API and minimal GUI for Cloudflare Workers. No API keys required.

## Run

```sh
bun install
bun run dev
```

Open http://localhost:8787 or call:

```sh
curl 'http://localhost:8787/api/v1/search?q=cloudflare+workers'
```

`GET /api/v1/search` accepts a nonempty `q` and an optional comma-separated `engines` selection: `bing`, `brave`, `google_cse`. All three run by default. Results contain `title`, `url`, `snippets` (plain-text strings), and `engines`.

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

Returns all available first-page web results, without pagination or image search. Partial results include engine failures in `engine_errors`. Invalid input returns 400; failure of every selected engine returns 502.

## Deploy

```sh
bun run deploy
```

The endpoint is public and unauthenticated. Search terms are sent to the selected providers and may appear in platform request logs.

## License

[AGPL-3.0-or-later](LICENSE). Adapted from [SearXNG](https://github.com/searxng/searxng).
