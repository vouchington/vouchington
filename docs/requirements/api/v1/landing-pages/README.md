# Landing Pages Analytics API

Source entrypoint: [backend/api/v1/landing-pages/README.md](../../../../../backend/api/v1/landing-pages/README.md)

## Endpoints

### POST `/api/v1/landing-pages/:landingPageId/visits`

Records a landing page visit. Returns `200 { ok: true }` on success or when rate limited. Returns `400` for a malformed `landingPageId` or an over-long field, `422` for a body that does not match the [request contract](../../reference-content-routes-request-validation.md) (wrong types or unknown fields), `415` for non-JSON content-type.

When the request includes active Global Privacy Control (`Sec-GPC: 1` or the worker-normalized
`x-voucha-gpc: 1`), the endpoint validates the request shape and returns `200 { ok: true }`
without recording analytics.

**Rate limit:** 5/min per session/IP (silently returns 200 when rate limited)

**Request body:**

```json
{
  "referrer": "https://instagram.com",
  "utm_source": "instagram",
  "utm_medium": "bio",
  "utm_campaign": "spring2025",
  "utm_content": "link"
}
```

All fields are optional.

### POST `/api/v1/landing-pages/:landingPageId/clicks`

Records a click on a landing page item. Returns `200 { ok: true }` on success or when rate limited. Returns `400` for a malformed `landingPageId`, `422` for a body that does not match the [request contract](../../reference-content-routes-request-validation.md) (a missing `landing_page_item_id`, wrong types or unknown fields), `415` for non-JSON content-type.

When the request includes active Global Privacy Control, the endpoint validates the request shape
and returns `200 { ok: true }` without recording analytics.

**Rate limit:** 20/min per session/IP

**Request body:**

```json
{
  "landing_page_item_id": "uuid",
  "group_member_id": "uuid"
}
```

`group_member_id` is optional, used for topic group member clicks.

## Performance

| Endpoint                                         | Round Trips | Caching | Notes                                                                                                                       |
| ------------------------------------------------ | ----------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| POST /api/v1/landing-pages/:landingPageId/visits | 3           | None    | Session lookup + rate limit check + analytics write; errors swallowed; GPC short-circuits before session-specific analytics |
| POST /api/v1/landing-pages/:landingPageId/clicks | 3           | None    | Session lookup + rate limit check + analytics write; errors swallowed; GPC short-circuits before session-specific analytics |

## Related

- Service: [../../../services/landing-page-analytics/](../../../../overview/architecture/services/landing-page-analytics/README.md)
- Parent: [../../AGENTS.md](../../../../../backend/api/AGENTS.md)
