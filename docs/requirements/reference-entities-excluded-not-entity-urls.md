# URL-Routable Entity Catalog reference

[Back to URL-Routable Entity Catalog](ENTITIES.md)

## Excluded — not entity URLs

Do not create helpers for these. Do not add ban rules.

| Prefix     | Reason                                                                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/*` | Static admin-tool routes (modlog, postgresql dashboard, etc.). Entity IDs appear only as query parameters or under entity routes (`/user/:id/admin`). Per `web/CLAUDE.md`, entity-scoped admin pages live under the entity route and are gated with `requireAdmin()`. |
