# RSS Feed Endpoints

RSS feeds for external feed readers. Endpoints can be read anonymously, and may also accept a valid API key with the `rss:read` scope for API-key identity rate limiting.

## Authentication

Pass your API key as a query parameter: `?apikey=<your-key>`.

API keys can be managed at `/my/api-keys`.

## Rate Limiting

3 requests per minute per identity and per IP address (dual rate limiting). Identity is the API key when `apikey` is present, otherwise the client IP. The 4th request within a 60-second window is rejected with 429.

## Endpoints

### `GET /rss/posts`

Returns an RSS 2.0 feed of user-generated posts.

**Query Parameters:**

| Parameter   | Type   | Description                                      |
| ----------- | ------ | ------------------------------------------------ |
| `apikey`    | string | Optional API key with `rss:read` scope.          |
| `topics`    | string | Comma-separated topic slugs to filter by.        |
| `post_type` | string | Post type filter (`discussion`, `review`, etc.). |
| `user`      | string | Username to filter posts by a specific user.     |

**Example:**

```http
GET /rss/posts?apikey=fil_xxxx&topics=world-of-hyatt,chase-sapphire-reserve
```

**Response:** `application/rss+xml`, valid RSS 2.0 document.

Only public posts (`broadcast=everyone`, `privacy=public`) are included.

---

### `GET /rss/news`

Returns an RSS 2.0 feed of external news items fetched from RSS feeds.

**Query Parameters:**

| Parameter | Type   | Description                                                                      |
| --------- | ------ | -------------------------------------------------------------------------------- |
| `apikey`  | string | Optional API key with `rss:read` scope.                                          |
| `topics`  | string | Comma-separated topic slugs to filter news items by associated topics.           |
| `sources` | string | Comma-separated topic slugs to filter by RSS feed source (topic → feed mapping). |

**Example:**

```http
GET /rss/news?apikey=fil_xxxx&topics=world-of-hyatt
GET /rss/news?apikey=fil_xxxx&sources=world-of-hyatt
```

**Response:** `application/rss+xml`, valid RSS 2.0 document.

---

## Caching

Anonymous responses include `Cache-Control: public, max-age=300` (5 minutes).

Requests with `apikey` include `Cache-Control: private, max-age=300` and `Referrer-Policy: no-referrer`. RSS tokens are read-only, but they are still bearer credentials in URLs, so avoid embedding keyed RSS URLs on public pages and revoke any key that appears in logs or analytics.

The Cloudflare Worker edge is authoritative for all response security headers and preserves this `no-referrer` policy end-to-end on keyed RSS routes (see `isKeyedRssReferrerRequest` in `cloudflare-worker/src/security-headers.mts`); anonymous RSS responses receive the global `strict-origin-when-cross-origin` default like every other route.

Machine-readable discovery surfaces (`/llms.txt`, `/.well-known/api-catalog`, and HTTP `Link`
headers) must advertise only anonymous RSS URLs. Never include `apikey` query strings or other bearer
credentials in discovery output.

Responses also include an `ETag` header (quoted SHA-256 digest, base64url-encoded). Note: RSS feeds include a dynamic `lastBuildDate` timestamp, so the ETag changes on each origin request. Conditional `If-None-Match: "<etag>"` requests will be served 304 only by the CF Worker cache, not by the origin directly.
