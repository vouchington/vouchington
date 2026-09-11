# Data Export

[Back to Users API](README.md#data-export)

### POST /api/v1/users/:idOrSlug/data-request

Initiates a data export. Returns 409 if an export is already in progress.

**Response (201):**

```json
{ "id": "<uuid>", "status": "pending", "created_at": "...", "expires_at": null }
```

### GET /api/v1/users/:idOrSlug/data-request

Returns the latest export request status. When the request is `ready` and still within its expiry
window, the response includes a presigned `download_url` for the export ZIP; otherwise
`download_url` is `null`.

**Response (200):**

```json
{
  "id": "<uuid>",
  "status": "ready",
  "created_at": "...",
  "expires_at": "...",
  "download_url": "https://..."
}
```
