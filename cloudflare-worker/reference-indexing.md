# Indexing

[Back to Cloudflare Worker](README.md#indexing)

Set `NOINDEX=true` for non-production deployments. The worker adds `X-Robots-Tag: noindex, nofollow, noarchive` to responses, serves `/robots.txt` with `Disallow: /`, and omits sitemap discovery from robots.txt, response `Link` headers, and the API catalog.
