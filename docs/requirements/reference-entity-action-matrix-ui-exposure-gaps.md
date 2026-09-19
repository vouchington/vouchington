# Entity × Action Matrix reference

[Back to Entity × Action Matrix](ENTITY-ACTION-MATRIX.md)

## UI Exposure Gaps

Actions technically supported by the bookmarks API (predicates exist in [`entity-relations.md`](../overview/architecture/entity-relations.md)) or clearly needed for user safety, but not exposed in the UI, are tracked here with a linked GitHub issue until resolved.

No open gaps — the last tracked gap (formerly filed as jonathanong/filaments#3306, `rss_feed_item` Save) shipped in `web/components/news/news-item-actions.tsx`. Resolved gaps are removed rather than marked done; the next new gap re-adds the table (`# | Entity | Missing action | Predicate / type | Gap issue`) below this line.

---

## Related

- [Entity × Lifecycle Flow Matrix](./ENTITY-LIFECYCLE-MATRIX.md) — Create, Edit, Delete, Archive, Approve flows per entity with authorization tiers and page/component entry points
- [ACTIONS.md](./navigation/ACTIONS.md) — placement principles, tooltip rules, per-entity action button tables
- [ENTITY-ACTION-ICONS.md](./navigation/ENTITY-ACTION-ICONS.md) — canonical icon choices for user-facing entity/action controls
- [SIGNED_OUT_ACTIONS.md](./navigation/SIGNED_OUT_ACTIONS.md) — auth-state × entity × action visibility
- [ROUTES.md](./navigation/ROUTES.md) — route inventory
- [NEWS-DISCUSSIONS.md](./content/NEWS-DISCUSSIONS.md) — RSS item card and modal actions
- [COMMENTS.md](./content/COMMENTS.md) — comment node actions
- [POSTS.md](./content/POSTS.md) — post creation and display
- [TOPICS.md](./content/TOPICS.md) — topic management
- [USERS.md](./users/USERS.md) — user profile routes and management
- [SOURCES-DOMAINS.md](./content/SOURCES-DOMAINS.md) — source directory and domain pages
- [COMMUNITIES.md](./community/COMMUNITIES.md) — community join/leave and moderation
- [community-lists.md](./community/community-lists.md) — proxy follow/mute on curated lists
- [Entity Relations](../overview/architecture/entity-relations.md) — predicate vocabulary and relation tables
- [Bookmarks](../overview/architecture/bookmarks.md) — bookmark system implementation
- [Backend rules](../../backend/CLAUDE.md) — vote and permission API conventions
- [Web rules](../../web/CLAUDE.md) — UI, routing, and client conventions
