# Crawlers

Crawlers are rules on how to crawl different URLs.
Rules are generally per hostname.
A need for this is to make parsing pages easier.
For example, for a certain domain, we'd simplify the crawling by having a global rule to exclude the header.

## Acceptance Criteria

### Crawler Rules

- Rules are hostname-specific and there can be multiple crawlers per hostname
- Crawler selection for a hostname should use `priority DESC, id ASC`
- Define parsing strategies (exclude headers, extract specific content)
- Can be updated per hostname to improve crawl quality
- When new URLs are saved for unblocked hostnames, a crawler should exist (create on demand)
- `css_selectors_to_remove` updates are append-only and deduplicated (never auto-remove existing selectors)
- Wildcard hostname patterns are not supported for crawlers
- Weekly refresh jobs should re-evaluate hostname selectors when the crawler has not been updated in the current week

## Related

- System: [../../queues/crawler/](../../queues/crawler/README.md) - Crawler job queue
- Crawls: [../crawls/README.md](../crawls/README.md)
- Crawl Chunks: [../crawl-chunks/README.md](../crawl-chunks/README.md)
- URLs: [../urls/README.md](../urls/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
