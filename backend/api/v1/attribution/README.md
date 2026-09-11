# Attribution API

Records referral attribution for tracking how users arrive at the site.

## Endpoints

| Method | Route                          | Authentication       | Description                 |
| ------ | ------------------------------ | -------------------- | --------------------------- |
| POST   | `/api/v1/attribution/referrer` | None (session-based) | Record referral attribution |

## POST /api/v1/attribution/referrer

Records the referrer and landing URL for a session, enabling attribution of signups and conversions to referral sources.

**Request body:**

```json
{
  "referrer": "https://example.com",
  "landing_url": "https://app.example.com/some-page"
}
```

- `referrer` — usually the referring URL (max 255 chars). For automatic landing-page attribution on public `@username` routes, this is the landing-page owner username instead of a URL.
- `landing_url` — the page the user landed on (max 2048 chars, must be a valid URL)

**Response:** `200 OK` with `{ "ok": true }`

**Rate limiting:** 10 calls per minute per session/IP. Rate-limited requests silently return 200 to prevent enumeration.

**Notes:**

- Unknown referrers and self-referrals are silently ignored (returns 200)
- Attribution is tied to the session ID from the session cookie
- Public landing-page visits at `@username` and `@username/:slug` reuse this same flow automatically.
- Example default page attribution: `{ "referrer": "alice", "landing_url": "https://app.example.com/@alice" }`
- Example slug page attribution: `{ "referrer": "alice", "landing_url": "https://app.example.com/@alice/bonus" }`

## Performance

| Endpoint                          | Round Trips | Caching      | Notes                                        |
| --------------------------------- | ----------- | ------------ | -------------------------------------------- |
| POST /api/v1/attribution/referrer | 3           | None (write) | Session lookup, Valkey rate limit, DB insert |

## Related

- Service: [../../services/attribution/](../../../services/attribution/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
