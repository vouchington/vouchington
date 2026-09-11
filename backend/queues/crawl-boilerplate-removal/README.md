# Crawl Boilerplate Removal System

Nightly system that identifies and removes boilerplate HTML (headers, footers, navbars) from crawled pages by comparing multiple pages under the same hostname/parent-path.

## Queue Configuration

### Queues

- `crawl_html_boilerplate_removal` - Handles boilerplate detection and removal
  - `boilerplate_removal_dispatcher` - Daily 5 AM, finds hostname+path combos needing analysis
  - `boilerplate_removal` - Processes individual hostname+path pairs via Rust `extractDomRemovals`

### Important

- Makes NO external HTTP requests — only reads recent raw-body crawl HTML from S3 crawl storage and writes to DB
- Requires at least 2 crawled pages under the same parent path to compare
- Skips paths already processed within the past 7 days

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- [Boilerplate Removals Service](../../services/boilerplate-removals/README.md)
- [Crawlers Service](../../services/crawlers/README.md)
