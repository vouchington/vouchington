# Admin Navigation Matrix

Cross-cut reference that maps every admin-only entity to the admin pages and components where it can be acted on, and describes each action's route, file path, and navigation path(s) to reach it.

See also:

- [Entity × Action Matrix](./ENTITY-ACTION-MATRIX.md) — user-facing entity actions (upvote/save/hide/follow/subscribe/report)
- [Entity × Lifecycle Flow Matrix](./ENTITY-LIFECYCLE-MATRIX.md) — Create, Edit, Delete, Archive, Approve flows per entity with authorization tiers and entry-point components
- [Sidebar](./navigation/SIDEBAR.md) — sidebar visibility matrix and section ordering
- [Routes](./navigation/ROUTES.md) — complete route inventory
- [Actions](./navigation/ACTIONS.md) — placement principles, tooltip rules, and per-entity action tables
- [CRM](./admin/CRM.md) — CRM contact management
- [CUSTOMER-SUPPORT](./admin/CUSTOMER-SUPPORT.md) — support thread and contact management
- [memberships](./users/memberships.md) — membership grant/management
- [HOSTNAME-BLOCKING](./content/HOSTNAME-BLOCKING.md) — domain blocking and crawler management
- [RSS-FEED-CATEGORY-ALIASES](./content/RSS-FEED-CATEGORY-ALIASES.md) — unmapped RSS feed category triage
- Components: `web/components/app-sidebar/admin-sections.tsx`, `web/components/command-search-data.ts`

Authorization tiers for routes in this document:

- **`/admin/*`** — requires `administrator` role, gated globally at `web/app/admin/layout.tsx`. All such routes are `noindex, nofollow`.
- **`/:topic-type/:idOrSlug/settings/*`** — topic management sub-pages rendered within
  the topic detail layout; require `administrator` role and are accessible via the topic detail
  Settings dropdown when `isAdmin=true`.
- **`/growth`** — requires `administrator` or `investor` role (`web/app/(growth)/layout.tsx`).
- **`/urls`, `/url/:id`, `/url/:id/crawls/:crawlId`** — available to any authenticated user; included here because these pages are part of admin URL/crawler workflows.
- **`/domain/:idOrHostname`** — public page; the admin tabs (`DomainDetailTabs`: moderation, crawlers) are rendered only when the viewer has the `administrator` role.

---

## Contents

- <a id="table-a--entity--surface--actions--navigation"></a>[Table A — Entity × Surface × Actions × Navigation](reference-admin-navigation-matrix-table-a-entity-surface-actions-navigation.md)
- <a id="table-b--entity--action--description"></a>[Table B — Entity × Action × Description](reference-admin-navigation-matrix-table-b-entity-action-description.md)
- <a id="known-gaps-and-related"></a>[Known Gaps and Related](reference-admin-navigation-matrix-known-gaps.md)
