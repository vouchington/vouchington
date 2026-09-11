# GET /api/v1/communities Query Parameters

[Back to Communities API](README.md#get-apiv1communities-query-parameters)

| Parameter            | Type                                                 | Default | Description                                                                              |
| -------------------- | ---------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `q`                  | string                                               | —       | Full-text search query                                                                   |
| `limit`              | integer 1–100                                        | 20      | Page size; capped at 25 for unauthenticated requests                                     |
| `after`              | opaque cursor                                        | —       | Cursor for next page (from `page_info.end_cursor`)                                       |
| `sort`               | `name` \| `members` \| `virtual_subscriptions`       | `name`  | Sort order                                                                               |
| `member_id`          | `me`                                                 | —       | Filter to communities the authenticated user is a member of (requires auth)              |
| `list_scope`         | `mine`                                               | —       | Filter to communities the authenticated user belongs to or proxy-follows                 |
| `feed_category`      | `posts` \| `news` \| `news_sources` \| `news_topics` | —       | With `list_scope=mine`, keep only communities with list items that can source that feed  |
| `list_type`          | `follow` \| `mute`                                   | —       | Filter to communities with the specified list type                                       |
| `has_list_type`      | `true`                                               | —       | Filter to communities with any list type set                                             |
| `has_list_items`     | `true`                                               | —       | Filter to communities that have at least one list item                                   |
| `eligible_post_type` | `discussion` \| `review` \| `data_point`             | —       | Filter to active communities where the authenticated user can create that root post type |

By default, `GET /api/v1/communities` returns only public communities. Authenticated users
additionally see private communities they are active members of; administrators see all communities.

`eligible_post_type` is intended for global create pages that accept `community=<slug>` in the URL.
It requires authentication, filters to active memberships in unarchived communities, and additionally
requires `allow_review_posts=true` for reviews or `allow_data_point_posts=true` for data points.
Discussions are always eligible for active members.

Response always includes a `users` map (`Record<string, { id, username }>`) keyed by owner user ID,
so the frontend can display the owner for each community without a separate lookup.

Response includes `community_metrics` (a `Record<string, CommunityMetrics>`) when `sort` is
`members` or `virtual_subscriptions`, or when `has_list_items=true`.
