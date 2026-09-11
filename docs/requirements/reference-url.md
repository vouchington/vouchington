# `url`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md#url)

| Action     | Description                                                                                                     | Route                      | File path                                                        | Navigation path(s)                    |
| ---------- | --------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| Search     | Search all URLs with cursor-based infinite scroll. Requires authentication; see authorization tier table above. | `/urls`                    | `web/app/(topics)/urls/page.tsx` (inferred)                      | sidebar: CMS → URLs; command: URLs    |
| View URL   | View URL metadata, inline crawl history (cursor-paginated), and trigger a new crawl.                            | `/url/:id`                 | `web/app/(topics)/url/[id]/page.tsx` (inferred)                  | inline: from `/urls` search result    |
| View Crawl | View content from a specific crawl snapshot.                                                                    | `/url/:id/crawls/:crawlId` | `web/app/(topics)/url/[id]/crawls/[crawlId]/page.tsx` (inferred) | inline: from `/url/:id` crawl history |
