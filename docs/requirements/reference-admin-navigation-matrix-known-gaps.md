# Admin Navigation Matrix reference

[Back to Admin Navigation Matrix](ADMIN-NAVIGATION-MATRIX.md)

## Known Gaps

| #   | Entity / Area  | Gap                                                                                                                                     | Notes                                                                                      |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 2   | `post`         | No dedicated admin aside on post detail pages; gated overflow-menu items (delete/lock/unpublish) exist but there is no aside component. | See `getPostOverflowVisibility` in `web/components/posts/post-detail-overflow-guard.ts`.   |
| 4   | `notification` | No admin-specific notification CTAs in the inbox. Admin relies on `target_path` generic routing for any admin-relevant notifications.   | Inbox uses the same `target_path` routing for all roles.                                   |
| 5   | (general)      | Definitive list of lifecycle action gaps is in [ENTITY-LIFECYCLE-MATRIX.md](./ENTITY-LIFECYCLE-MATRIX.md).                              | That file is the canonical source for missing Create/Edit/Delete/Approve flows per entity. |

Resolved: gap #1 (`crawler`) shipped as the `/crawlers` index page (`web/app/(crawlers)/crawlers/page.tsx`); gap #3 (`user`) shipped as the admin-gated `/user/:idOrUsername/admin` panel linked from `web/components/users/user-profile-header.tsx`.

---

## Related

- [Entity × Action Matrix](./ENTITY-ACTION-MATRIX.md) — user-facing entity actions (upvote/save/hide/follow/subscribe/report)
- [Entity × Lifecycle Flow Matrix](./ENTITY-LIFECYCLE-MATRIX.md) — Create, Edit, Delete, Archive, Approve flows per entity with authorization tiers
- [Sidebar](./navigation/SIDEBAR.md) — sidebar visibility matrix and section ordering
- [Routes](./navigation/ROUTES.md) — complete route inventory
- [Actions](./navigation/ACTIONS.md) — action button placement principles and tooltip rules
- [CRM](./admin/CRM.md) — CRM contact management
- [CUSTOMER-SUPPORT](./admin/CUSTOMER-SUPPORT.md) — support thread and contact management
- [vote-integrity](./trust-safety/vote-integrity.md) — vote integrity flag review
- [memberships](./users/memberships.md) — membership grant/management
- [HOSTNAME-BLOCKING](./content/HOSTNAME-BLOCKING.md) — domain blocking and crawler management
- [RSS-FEED-CATEGORY-ALIASES](./content/RSS-FEED-CATEGORY-ALIASES.md) — unmapped RSS feed category triage
- [Web rules](../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../backend/CLAUDE.md) — service, API, and data conventions
