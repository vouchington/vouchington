# Trending, Referral, Search and Reference Read Tools

Eight MCP read tools cover the trending lists, referral programs, web search and reference data.
Each is read-only (`readOnlyHint`), names its REST twin in `meta.api`, sits on the `internal`,
`mcp` and `client` surfaces, and needs no paid plan. The generated [tool catalog](catalog.md) holds
each tool's description and scopes; the [agent tools overview](README.md) covers metadata and plan
gating, and the [hostname, list and user read tools](hostname-list-user-read-tools.md) describe the
result shape and paging rules these tools share.

| Tool                             | REST twin                                       | Scope                 | Arguments                               |
| -------------------------------- | ----------------------------------------------- | --------------------- | --------------------------------------- |
| `get_trending_communities`       | `GET /api/v1/trending-communities`              | `communities:read`    | `limit`, `after`                        |
| `get_trending_referral_programs` | `GET /api/v1/trending-referral-programs`        | `topics:read`         | `limit`, `after`                        |
| `get_topic_referral_program`     | `GET /api/v1/topics/:idOrSlug/referral-program` | `topics:read`         | `topic_id` (UUID or slug)               |
| `get_my_referral_links`          | `GET /api/v1/referral-links`                    | `referral-links:read` | `referral_program_id`, `limit`, `after` |
| `search_web`                     | `GET /api/v1/web-search`                        | `web-search:read`     | `query`, `limit`                        |
| `list_countries`                 | `GET /api/v1/countries`                         | `reference-data:read` | none                                    |
| `list_currencies`                | `GET /api/v1/currencies`                        | `reference-data:read` | `limit`, `after`                        |
| `get_platform_stats`             | `GET /api/v1/platform-stats`                    | `reference-data:read` | none                                    |

`web-search:read` and `reference-data:read` are new resource scopes, and `mcp.user:read` covers them
like every other user read scope ([scope policy](../backend/modules/scopes/README.md)). The other
three already existed. Each tool owns a closed output schema picked from the generated REST
contracts, and the result is `{ success: true, ... }` or `{ success: false, error }`, so a missing
topic and a malformed cursor never surface as a tool failure. Paged tools take `limit` 1 to 25 and
return `page_info`; the cap is 25 even where REST allows 50 or 100 for a signed-in caller. Defaults are 10 for the trending lists, 20 for referral links and 25 for currencies. A
malformed cursor, or one minted by another tool, returns `{ success: false, error: "Invalid
cursor" }`.

## Trending

Both trending tools return ids with a score, not the entities: use `get_community`,
`get_topic_details` or `get_referral_links` for the rest. `get_trending_communities` reads as a
signed-out reader for every caller, so a private community never appears, whatever it scores, even
to its owner or an administrator. Each result is `{ id, trending_score, member_count, post_count,
virtual_subscription_count }`. `get_trending_referral_programs` counts the active links of an
enabled program from the last 30 days and returns `{ id, trending_score, link_count }`; a disabled
program is left out. Both tools call the uncached service, not the cached one signed-out REST
uses.

## Referral programs and links

`get_topic_referral_program` takes a topic UUID or slug and returns `{ topic_id, company_id,
enabled_at, disabled_at }`, with the dates as ISO text. It answers `Topic not found`, `Topic is not
a referral program` or `Referral program attributes not found` instead of failing.

`get_my_referral_links` lists the caller's own links, newest first, and has no `user_id` argument:
one passed anyway is ignored, so this tool never lists another user's links. A
`referral_program_id` that is not a UUID returns `{ success: false, error: "Invalid
referral_program_id" }` before the database is read. Each link is `{ id, referral_program_id,
referral_program_name, referral_program_slug, url, label, created_at, activated_at,
deactivated_at }`; the program name and the label are sanitized as titles.

## Web search

`search_web` searches the pages Voucha has crawled, by text or by URL. It returns one page of at
most `limit` results (default 25) and no cursor, so `page_info` reports no next page. A
query under three characters returns an empty page, as REST does. Each result is `{ url, snippet,
match_type }`. The URL carries the public hostname (`id`, `hostname`, `topic_id`) and never the
hostname's moderation or crawl state, and a blocked hostname never appears. The snippet is text
from another website: it is wrapped with `wrapExternalContent` (source `web_search`) and holds
`⟦MARK⟧` markers around the matching words, and it is `null` for a result that matched on URL alone.

## Reference data

`list_countries` returns the fixed country list and `list_currencies` the supported currencies by
code, each with its minor unit exponent, paged by cursor. `get_platform_stats` returns the six
Voucha-wide counts (`topic_count`, `rss_feed_count`, `post_count`, `review_count`,
`data_point_count`, `hostname_count`); the counts are cached for a short time and can trail the
database slightly. All three read the same public data the signed-out REST routes return.

## Routes without a tool

- `GET /api/v1/search` (omnisearch): the per-vertical search tools already cover it.
- `/localization`, `/feature-flags` and `/curated-aside-items`: interface copy, rollout flags and
  sidebar placement for the web and native clients.
- `/availability`: a signed-in check of whether a username or slug is free, for forms.
- The official referral links of a program: only people who manage official links can list them.
- `GET /api/v1/scopes`: the catalog the API key and OAuth pickers render when a credential is made.
- Community list items, `GET /api/v1/lists/contains` and `GET /api/v1/memberships/plans`: see
  [Community List, List Membership and Membership Plan Read Tools](community-list-membership-read-tools.md).
