# Navigation reference

[Back to Navigation](NAVIGATION.md)

## Vocabulary

| Term           | Definition                                                                            | Code symbol                |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| **Intent**     | Top-level grouping shown as a dropdown in the top bar and sidebar                     | `NavIntent`, `NavIntentId` |
| **Group**      | Sub-group of items within an active intent, rendered as a collapsible sidebar section | `NavGroup`                 |
| **Item**       | A single navigable destination within a group                                         | `NavItem`                  |
| **MediaType**  | Content format (news article, podcast episode, video, post)                           | post type enum             |
| **EntityType** | Underlying database entity (Topic, Source, Community, User…)                          | entity type enum           |
| **Vertical**   | A product area bounded by its primary entity type (not used for navigation)           | n/a                        |

## Source of Truth

All intent configuration lives in `web/lib/navigation/intents/`:

- `types.ts` — TypeScript types (`NavItem`, `NavGroup`, `NavIntentId`, `NavIntent`)
- `product-posts.ts`, `product-other.ts` — product intents split by category (`PRODUCT_INTENTS`)
- `admin.ts` — admin intents (`ADMIN_INTENTS`); `moderation` is auth-gated with role-gated sub-groups
- `resolver.ts` — `getActiveIntent(pathname)` route resolver
- `../intents.ts` — barrel that exports `NAV_INTENTS` and all types

Breadcrumb APIs live in `web/lib/navigation/`:

- `breadcrumbs.ts` — `buildBreadcrumbsForPath` (public), `buildBreadcrumbs` (internal)
- `use-resolved-breadcrumbs.ts` — `useResolvedBreadcrumbs` hook (client components)

The Cmd+K command palette derives its page shortcuts from the same `NAV_INTENTS` registry via `web/lib/navigation/derive-page-shortcuts.ts`; never add shortcuts there directly. Intents whose palette items are gated behind a feature flag must have an entry in `INTENT_FEATURE_FLAGS` in that file.
