# `crawler`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md#crawler)

| Action        | Description                                                        | Route                                                               | File path                                       | Navigation path(s)                                                                                                |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| List Crawlers | List crawlers.                                                     | `/crawlers` (admin-only via `requireAdmin()`)                       | `web/app/(crawlers)/crawlers/page.tsx`          | direct navigation only — no sidebar or command-palette entry                                                      |
| View Crawler  | View crawler configuration and run history.                        | `/crawler/:id` (admin-only via entity layout `requireAdmin()`)      | `web/app/(crawlers)/crawler/[id]/page.tsx`      | inline: from `/crawlers` row; aside: crawlers tab (`DomainCrawlersPanel`) on `/domain/:idOrHostname` (admin-only) |
| Edit Crawler  | Edit crawler configuration (seed URLs, schedule, selectors, etc.). | `/crawler/:id/edit` (admin-only via entity layout `requireAdmin()`) | `web/app/(crawlers)/crawler/[id]/edit/page.tsx` | aside: crawlers tab (`DomainCrawlersPanel`) on `/domain/:idOrHostname` (admin-only)                               |
