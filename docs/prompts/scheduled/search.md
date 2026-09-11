Review search and list filtering. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [Search Architecture](../../../docs/overview/architecture/search.md), top-bar search, feed/list filters, privacy filters, and sitemap/indexing interactions for one bounded issue.
- Prioritize ranking correctness, cursor pagination, hashtag filter dimensions, URL search min-length guards, privacy/moderation filtering, and anonymous search caching.
- Keep backend search, API clients, and frontend controls aligned for the selected surface.
- Skip findings already covered by open issues or open PRs.
- Add or tighten tests for the selected search or filtering behavior.
