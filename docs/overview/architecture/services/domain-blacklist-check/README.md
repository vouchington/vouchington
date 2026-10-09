# domain-blacklist-check

Source entrypoint: [backend/services/domain-blacklist-check/README.md](../../../../../backend/services/domain-blacklist-check/README.md)

Validates URLs and markdown content against the domain blacklist before persisting user-supplied data.

## Functions

- **`assertNoBlockedDomains(markdown)`** — Extracts all URLs (links and images) from markdown via the Rust `extractMarkdownUrls` function, reads one batched hostname policy for every domain and URL, throws HTTP 400 if any domain is blocked, then runs the Web Risk check for each URL with those precomputed policies (no repeated blocklist reads).

- **`assertUrlNotBlocked(url)`** — Validates a single URL's domain against the domain blacklist and Web Risk from one policy read. Throws HTTP 400 if blocked. Skips validation for unparseable URLs.

## Consumers

- [`backend/services/my/profile.mts`](../../../../../backend/services/my/profile.mts) — `updateProfileMarkdown` calls `assertNoBlockedDomains` before persisting profile markdown.
- [`backend/services/my/profile-links.mts`](../../../../../backend/services/my/profile-links.mts) — `createProfileLink` and `updateProfileLink` call `assertUrlNotBlocked` before persisting URL-type profile links.

## Dependencies

- `@services/markdown/extraction` — Rust-based URL extraction from markdown
- `@ts-shared/utils/urls` — `extractDomain` helper
- `@services/urls-domains-blacklist/domains` — `getHostnamePolicies` (bloom filter + DB, batched)
- `@services/web-risk` — `assertUrlsAllowedByWebRisk`

## Related

- [URL Domains Blacklist Service](../urls-domains-blacklist/README.md)
- [Markdown Service](../markdown/README.md)
