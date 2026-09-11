# Blacklist API

Admin-only endpoints for managing the URL/domain blacklist.

All endpoints require the current user to have the `manage_blacklist` permission
(checked via `currentUserCanManageBlacklist`).

## Endpoints

### POST /api/v1/blacklist/dispatch

Triggers the blacklist dispatcher job to process pending blacklist entries.

**Authorization:** Admin only (403 if unauthorized)

**Request:** No body required.

**Response:**

```json
{ "success": true }
```

---

### POST /api/v1/blacklist/source-sync

Triggers a source sync job for a specific blacklist source.

**Authorization:** Admin only (403 if unauthorized)

**Request:**

```json
{ "sourceId": "1" }
```

| Field      | Type              | Required | Description                       |
| ---------- | ----------------- | -------- | --------------------------------- |
| `sourceId` | integer or string | Yes      | Positive integer ID of the source |

Returns 400 if `sourceId` is missing, not an integer/integer string, or not positive.
Returns 415 if `Content-Type` is not `application/json`.

**Response:**

```json
{ "success": true }
```

## Performance

| Endpoint                           | Round Trips | Caching      | Notes                               |
| ---------------------------------- | ----------- | ------------ | ----------------------------------- |
| POST /api/v1/blacklist/dispatch    | 1           | None (write) | Auth check, fire-and-forget enqueue |
| POST /api/v1/blacklist/source-sync | 1           | None (write) | Auth check, fire-and-forget enqueue |

## Related

- Service: [../../services/urls-domains-blacklist/](../../../services/urls-domains-blacklist/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
