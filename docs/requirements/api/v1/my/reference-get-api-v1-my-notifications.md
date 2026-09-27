# GET /api/v1/my/notifications

[Back to My API](README.md#get-apiv1mynotifications)

Query parameters:

- `after` - opaque pagination cursor
- `limit` - number of rows to return

Responses include notifications plus a minimal `{ id, slug, name }` community sidecar for
accessible structured community targets. Lifecycle notifications use nullable `target_path` with
`target_entity`; the combined weekly digest and reporter review notifications use
`target_intent: "notifications_inbox"`.
