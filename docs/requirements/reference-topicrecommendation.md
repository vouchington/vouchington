# `topic_recommendation`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md)

| Action          | Description                                                                                      | Route                    | File path                                | Navigation path(s)                                                   |
| --------------- | ------------------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------- | -------------------------------------------------------------------- |
| Recommendations | Browse shared topic recommendations sorted by best score.                                        | `/topic-recommendations` | `web/app/topic-recommendations/page.tsx` | sidebar: CMS → Topic Recommendations; command: Topic Recommendations |
| Top Hashtags    | Browse the rolling 30-day hashtag aggregate; search and filter linked or unlinked hashtags.      | `/topic-recommendations` | `web/app/topic-recommendations/page.tsx` | Topic Recommendations → Top Hashtags                                 |
| Manage Hashtag  | Administrators link a hashtag to an existing topic, create a topic from it, or unlink its topic. | `/topic-recommendations` | `web/components/topic-recommendations/`  | Topic Recommendations → Top Hashtags                                 |

Both tabs require a signed-in user. Hashtag management actions require an administrator. The Top
Hashtags tab is cursor-paginated with `after`; its cursor is scoped to the normalized `q` and
`mapping=all|linked|unlinked` filters.

The ranking is served from `mv_top_hashtags`, refreshed through the PostgreSQL materialized-view
queue. Content, moderation eligibility, and topic lifecycle events enqueue a five-minute-debounced
refresh, and an hourly schedule is the safety net. Queue ordering plus a PostgreSQL advisory lock
guarantee that only one refresh runs at a time across workers.

The materialized view counts distinct eligible public posts and discoverable RSS items from the last
30 days. It excludes deleted, non-public, uncleared, recommendation, suspended-author, and
system-authored posts; comments also require a publicly cleared root. RSS items require an enabled,
discoverable feed whose owning topic remains active. The aggregate requires positive alias-category
relations and suppresses hashtags with fewer than three distinct contributors. Display casing is
chosen by distinct-item frequency, then most recent content, then lexical order. Topic linkage is
joined at read time so link and unlink actions do not require the aggregate to be rebuilt before
mapping filters are accurate.
