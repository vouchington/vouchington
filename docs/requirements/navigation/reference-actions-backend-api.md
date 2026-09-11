# Action Buttons reference

[Back to Action Buttons](ACTIONS.md)

## Backend API

All bookmark actions use the generic bookmarks API:

- `PUT /api/v1/bookmarks/:entityType/:entityId/:predicate` — create bookmark
- `DELETE /api/v1/bookmarks/:entityType/:entityId/:predicate` — remove bookmark
- `GET /api/v1/bookmarks/:entityType/:entityId` — get all bookmarks for an entity

Supported predicates: `follow`, `mute`, `block`, `subscribe`, `subscribe_posts`, `subscribe_rss_feed_items`, `save`, `hide`, `dismiss_recommendation`, `proxy_follow`, `proxy_mute`.

## Related

- [Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md) — cross-cut table of every entity × surface × action, plus Table B descriptions and known gaps
- [Entity × Action Icons](./ENTITY-ACTION-ICONS.md) — canonical icon choices for user-facing entity/action controls
- [Entity × Lifecycle Flow Matrix](../ENTITY-LIFECYCLE-MATRIX.md) — Create, Edit, Delete, Archive, Approve flows per entity with authorization tiers and entry-point components
- [Signed-out Actions](./SIGNED_OUT_ACTIONS.md) — auth-state × entity × action visibility policy
- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](./ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
