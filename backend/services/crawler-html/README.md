# @services/crawler-html

HTTP HTML crawler with structured error handling and analytics metrics tracking.

Applies Vouchington's request headers, SSRF-pinned transport, response-size limits, error
classification, and analytics around `@vouchington/crawler-html` decoding and extraction. HTML is
spooled to an owned OS-tempdir file with a 4 MiB ceiling; only the parser's bounded Uint8Array API
receives an in-memory copy. Hashing and S3 snapshot upload read that file as streams.

After HTML extraction, the service passes the already-extracted document to
`@vouchington/embeds`; it does not fetch the page a second time or perform the optional remote
oEmbed request. It returns crawl-local metadata plus the discovered endpoint plan. The crawl
service persists both before the application-owned `crawl_embeds` queue performs enrichment.

## Key exports

- `default CrawlerHtml(options: CrawlerHtmlOptions, markdownOptions: CrawlerHtmlToMarkdownOptions): Promise<CrawlerHtmlResult>` — fetches and converts a URL; throws on errors
- `fetchCrawlerHtml(options, markdownOptions)` — applies transport policy and returns the raw crawl result
- `CrawlerHtmlOptions`, `CrawlerHtmlResult` — service-owned transport/result contracts

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Generic extraction: [`@vouchington/crawler-html`](https://github.com/vouchington/vouchington-platform/tree/main/packages/crawler-html)
- Generic embed resolution: [`@vouchington/embeds`](https://github.com/vouchington/vouchington-platform/tree/main/packages/embeds)
- Application embed policy: [../crawl-embeds/README.md](../crawl-embeds/README.md)
- Crawling architecture: [../../../docs/overview/architecture/crawling.md](../../../docs/overview/architecture/crawling.md)
- Crawler utils: [../crawler-utils/README.md](../crawler-utils/README.md)
- Crawler system: [../../queues/crawler/README.md](../../queues/crawler/README.md)
