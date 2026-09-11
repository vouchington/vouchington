# domain-blacklist-check

Validates URLs and markdown content against the domain blacklist before persisting user-supplied data.

## Functions

- **`assertNoBlockedDomains(markdown)`** — Extracts all URLs (links and images) from markdown via the Rust `extractMarkdownUrls` function, checks each domain against the domain blacklist, and throws HTTP 400 if any domain is blocked.

- **`assertUrlNotBlocked(url)`** — Validates a single URL's domain against the domain blacklist. Throws HTTP 400 if blocked. Skips validation for unparseable URLs.

## Consumers

- [`backend/services/my/profile.mts`](../my/profile.mts) — `updateProfileMarkdown` calls `assertNoBlockedDomains` before persisting profile markdown.
- [`backend/services/my/profile-links.mts`](../my/profile-links.mts) — `createProfileLink` and `updateProfileLink` call `assertUrlNotBlocked` before persisting URL-type profile links.

## Dependencies

- `@services/markdown/extraction` — Rust-based URL extraction from markdown
- `@ts-shared/utils/urls` — `extractDomain` helper
- `@services/urls-domains-blacklist/domains` — `isUrlBlocked` (bloom filter + DB)

## Related

- [URL Domains Blacklist Service](../urls-domains-blacklist/README.md)
- [Markdown Service](../markdown/README.md)
