# RSS Feed Cover Art

Rewrites an RSS feed's podcast cover art URL into a signed, absolute `IMAGE_ORIGIN/sideload/` proxy URL at API-response time, so the raw source URL never leaves the database and signing-key rotation needs no data backfill.

## Usage

```typescript
import { proxyRssFeedCoverArt } from '@modules/rss-feed-cover-art/proxy-cover-art'

const feed = proxyRssFeedCoverArt(rawFeed)
```

- `proxyRssFeedCoverArt(feed)` — replaces `feed.podcast_show.cover_art_url` with a signed, absolute image-host `/sideload/` URL (400px width). Returns the feed unchanged if there's no cover art URL, and sets `cover_art_url` to `null` if the URL can't be signed.
- `getSigningKeys()` — parses and memoizes the sideload signing keys used to sign/verify proxy URLs. Used internally by `proxyRssFeedCoverArt`; exported for callers that need the same key set.
