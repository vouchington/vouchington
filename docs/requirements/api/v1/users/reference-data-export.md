# Data Export

[Back to Users API](../../../../../backend/api/v1/users/README.md#data-export)

### POST /api/v1/users/:idOrSlug/data-request

Initiates a data export. Returns 409 if the caller already has an export in progress for the account.
An administrator can start an export for any account; it is recorded against the administrator and
stays hidden from the account holder (see
[administrator-requested exports](../../../users/ACCOUNT-DATA-EXPORT.md#administrator-requested-exports)).

**Response (201):**

```json
{ "id": "<uuid>", "status": "pending", "created_at": "...", "expires_at": null }
```

### GET /api/v1/users/:idOrSlug/data-request/stream

Streams status events for the caller's latest export request, or for the export named by the optional
`request_id` query parameter. A `request_id` that is not a UUID returns `422`
(`Invalid request ID`); an unknown one, or one the caller did not request, returns `404`. The stream cannot declare a query carrier, so
the UUID check lives in the handler (see the selected
[data-request stream cases](../../reference-content-routes-request-validation.md#user-updates-and-data-request-stream)).

### GET /api/v1/users/:idOrSlug/data-request

Returns the status of the latest export request the caller made, or `404` when there is none. When the request is `ready` and still within its expiry
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
