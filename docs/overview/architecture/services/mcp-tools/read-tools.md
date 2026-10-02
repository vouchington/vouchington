# Post, Story, Community, Hostname, List and User Read Tools

[Back to MCP Tools service](README.md#structured-tool-results)

`get_post`, `get_post_ancestors`, `get_post_descendants` and `get_story` read a post, its thread and
a news story. Each requires the `posts:read` scope, is read-only, names its REST twin in `meta.api`,
and sits on the `internal`, `mcp` and `client` surfaces like the other post tools. `search_posts`
is not one of them but follows their [privacy rule](#privacy). The
[community read tools](#community-read-tools) follow the same shape with the `communities:read`
scope, and the [hostname](#hostname-read-tools), [list](#list-read-tools) and
[user](#user-read-tools) read tools with `hostnames:read`, `lists:read` and `users:read`.

| Tool                   | REST twin                                 | Arguments                                              |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `get_post`             | `GET /api/v1/posts/:idOrSlug`             | `post_id` (UUID or slug)                               |
| `get_post_ancestors`   | `GET /api/v1/posts/:idOrSlug/ancestors`   | `post_id` (UUID or slug)                               |
| `get_post_descendants` | `GET /api/v1/posts/:idOrSlug/descendants` | `post_id`, `limit` (1-200), `after`                    |
| `get_story`            | `GET /api/v1/stories/:id`                 | `story_id`, `limit` (1-25), `after`, `exclude_item_id` |

## Result shape

Each tool owns a closed output schema (`backend/tools/mcp-post-output.mts`, `mcp-story-output.mts`)
whose fields are picked from the generated REST `Post`, `Story`, `ViewRssFeedItem` and `PageInfo`
components, and `post-read-tools.output-schema.test.mts` pins every field to `openapi.json`. The
result is `{ success: true, ... }` or `{ success: false, error }`, so expected bad input (a missing
post, a malformed cursor) never surfaces as a tool failure. `after` is the opaque
`page_info.end_cursor` of the previous page, and a malformed one returns `Invalid cursor`.

Post markdown and article markdown are wrapped with `wrapExternalContent`, and titles are sanitized
like the `search_posts` and `search_rss_feed_items` results.

## Privacy

MCP is parity minus private data. `resolveReadableThread` (`backend/tools/mcp-post-access.mts`)
answers a post as `Post not found` unless every live node of its parent chain passes the shared
`canViewPostsBatch` policy both as the credential owner and as a signed-out reader. A post the owner
sees only through private visibility (a private audience, a private community, or their own
unapproved post) is therefore never returned, even to its author, and a topic recommendation is
never returned. One hidden ancestor hides the whole thread, so a `parent_id`, title or count never
reveals it.

`search_posts` applies the same rule to what it returns, so a search never lists a post these tools
would refuse. Its query judges every candidate as a signed-out reader (`public_eligibility_only` in
`backend/services/posts/search/query-builder/base-filters.mts`), even for the author or an
administrator, so private, audience-limited and not-yet-cleared posts are not listed. When
`post_type` includes `comment`, `thread-readability.mts` also drops a comment unless every live
ancestor is approved and not a topic recommendation, the chain rule above. A `similar_post_id` seed
that `get_post` would refuse is answered like an id that matches nothing, an empty page, so its
embedding cannot be probed. The owner's mutes and blocks still remove results.

The inclusion is one-way: a search result is always readable through `get_post`, but a readable
post may not be found by search, which also needs `broadcast = everyone`, an unarchived post, an
unsuspended author and no community. The chain check (JavaScript) and the search filter (SQL) must
stay aligned; `output-schema-contract-search-posts.agreement.test.mts` compares them on shared
fixtures.

`get_post_descendants` pages with the REST descendants page (`getCommentDescendantsPage`), whose
cursors are scoped to the thread and never to a viewer; a hidden reply prunes its subtree. A deleted
post is left out rather than tombstoned, because the `view_posts` read model does not return it, so
a `parent_id` can name a post that is not listed. Anonymous posts hide their author from every
caller, including the author.

`get_story` needs no owner-and-signed-out check. Stories are public, and the only viewer-dependent
filters on their articles (`getStoryMemberPagesBatch`) are the owner's own mutes, hides and excluded
hostnames, which only remove articles, so no article is reachable through private visibility.

## Community read tools

Five tools read communities. Each requires the `communities:read` scope (a resource scope covered by
the `mcp.user:read` umbrella), is read-only, and names its REST twin in `meta.api`.

| Tool                         | REST twin                                        | Arguments                                                            |
| ---------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `search_communities`         | `GET /api/v1/communities`                        | `q`, `sort` (name, members, virtual_subscriptions), `limit`, `after` |
| `get_community`              | `GET /api/v1/communities/:idOrSlug`              | `community_id` (UUID or slug)                                        |
| `get_community_posts`        | `GET /api/v1/communities/:idOrSlug/posts`        | `community_id`, `sort` (new, hot), `q`, `limit`, `after`             |
| `get_community_pinned_posts` | `GET /api/v1/communities/:idOrSlug/pinned-posts` | `community_id`                                                       |
| `get_community_members`      | `GET /api/v1/communities/:idOrSlug/members`      | `community_id`, `role` (owner, moderator, member), `limit`, `after`  |

Paged tools take `limit` 1 to 25 (default 20), refuse anything else as invalid params, and return
`page_info` whose `end_cursor` is passed back as `after` with the same sort. The REST routes allow
100 on some of these; the tools keep the signed-out cap of 25. A malformed cursor, or one minted by
another sort, returns `{ success: false, error: "Invalid cursor" }`.

`get_community_posts` returns `pinned_post_ids` instead of hydrated pins, and only on the first
page that has no `q` filter (pinned posts are left out of every unfiltered page, as on REST).
`get_community_pinned_posts` hydrates them in pin order.

### Community privacy

The tools act as a signed-out reader for every caller, so they are parity minus private data. Each
tool resolves its community through `loadCommunityForViewer(null, idOrSlug)`
(`backend/tools/mcp-community-output.mts`), and a private, deleted or unknown community is
`{ success: false, error: "Community not found" }` for its member, moderator, owner and an
administrator alike. `search_communities` filters to public communities. Posts and pins use the
public post eligibility filter, so a pinned post the public can no longer read is left out, and
`get_community_members` returns the signed-out roster (owners and moderators, plus regular members
only when the roster is public). Anonymous posts hide their author from every caller, including the
author and administrators, and no response carries a viewer sidecar (membership, vote or follow
state).

Community descriptions, rules and post markdown are wrapped with `wrapExternalContent`; titles and
names are sanitized. The shared post-page and hashtag-query logic lives in `@services/communities`
(`getCommunityPostsPage`, `resolveCommunityHashtagQuery`), used by both the REST routes and the
tools, so the two cannot drift.

## Hostname read tools

`search_hostnames` and `get_top_hostnames` read the hostnames Voucha knows. Each requires the
`hostnames:read` scope (a resource scope covered by `mcp.user:read`), is read-only, and names its
REST twin in `meta.api`.

| Tool                | REST twin                   | Arguments                                                                     |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `search_hostnames`  | `GET /api/v1/hostnames`     | `query`, `hostname`, `topic` (UUID or slug), `sort` (trust), `limit`, `after` |
| `get_top_hostnames` | `GET /api/v1/hostnames/top` | `topic` (UUID or slug), `limit`, `after`                                      |

Both tools read as a signed-out reader for every caller, so an administratively blocked hostname
never appears, even to an administrator. Each result is `{ id, hostname, topic_id, election }`,
where `election` holds the public trust vote totals (`votes_count_up`, `votes_count_down`,
`votes_score_net`) or is `null` when the hostname has none. A `topic` that does not exist returns an
empty page. `search_hostnames` sorts by hostname, or by net trust votes with `sort: "trust"`;
`get_top_hostnames` lists hostnames with at least one trust vote up. Paging follows the
[community rules](#community-read-tools) with `limit` 1 to 25 (default 25).

## List read tools

`get_my_lists`, `get_list` and `get_list_items` read lists. Each requires the existing `lists:read`
scope (covered by `mcp.user:read`), is read-only, and names its REST twin in `meta.api`.

| Tool             | REST twin                     | Arguments                                                    |
| ---------------- | ----------------------------- | ------------------------------------------------------------ |
| `get_my_lists`   | `GET /api/v1/lists`           | `limit` (1-25, default 20), `after`                          |
| `get_list`       | `GET /api/v1/lists/:id`       | `list_id`                                                    |
| `get_list_items` | `GET /api/v1/lists/:id/items` | `list_id`, `media_type`, `limit` (1-25, default 20), `after` |

### List privacy

A public or unlisted list is readable by anyone who holds its id, as on the REST routes. A private
list is readable only by its owner, and only when the credential also holds the exact grant
`post-relations.owned-private:write`, the same consent the entity-relation write tools demand before
they touch an owner's private post. `mcp.user:write` never implies it (it is `requiresExactGrant`),
so a broad credential never reads a private list, and creating a credential with the grant also
requires `entity-relations:read` and `entity-relations:write`. Without the grant `get_my_lists`
leaves private lists out of the page and its cursor as if they did not exist.

Every denial is the same `{ success: false, error: "List not found" }`: another user's private
list, a private list read without the grant, a removed list, an unknown id and a malformed id cannot
be told apart. `loadReadableList` (`backend/tools/list-read-access.mts`) decides this for
`get_list` and `get_list_items`, and `hasOwnedPrivateGrant` answers false instead of throwing so a
read never reveals which condition failed.

`get_list_items` returns post and RSS feed items with the `item_type` and `entity_id` to read them
with. Each post goes through the same `resolveReadableThread` policy as `get_post` (the
[privacy rule](#privacy)), so a private, deleted or hidden post is left out of the page. A page can
therefore hold fewer items than `limit` while `page_info.has_next_page` is still true; keep paging
until it is false. List descriptions are wrapped with `wrapExternalContent` and names are
sanitized.

## User read tools

`get_user` and `search_users` read public user profiles. Each requires the `users:read` scope (a
resource scope covered by `mcp.user:read`), is read-only, and names its REST twin in `meta.api`.

| Tool           | REST twin                     | Arguments                                |
| -------------- | ----------------------------- | ---------------------------------------- |
| `get_user`     | `GET /api/v1/users/:idOrSlug` | `user_id` (UUID or username)             |
| `search_users` | `GET /api/v1/users`           | `q`, `limit` (1-25, default 10), `after` |

Both tools return the signed-out public profile for every caller: the caller's own account, another
user and an administrator all see `{ id, username, markdown, verification_status,
verified_badge_visible, verified_display_name, is_official_account }` and nothing else, never an
email address, phone number or suspension. A deleted or unknown user is
`{ success: false, error: "User not found" }`, and `get_user` takes a UUID or username (case
insensitive), refusing an email address or phone number as an invalid identifier. The verified name
appears only while the user shows the verified badge. `search_users` matches the start of a
username, A to Z, treats a LIKE wildcard as plain text, and returns nothing for a blank query, an
email address or an id. The bio is wrapped with `wrapExternalContent`.

## Administrative actions

Admin tools reuse domain service validation and history paths with explicit actor identity. They are exclusive to `admin_mcp`, require administrator role and their catalogued OAuth scopes, and do not depend on membership plans. Calls enforce the same scope policy used by listing. Expected 4xx failures return a typed `isError` payload with status, code, message, and `retryable: false`; unexpected failures retain the generic error and telemetry path.

The shared admin factory marks user-authored and AI-derived text as untrusted external content and omits credential and verification secrets from both results and schemas. See [scope policy](../../backend/modules/scopes/README.md) and [training evidence](../moderation-training/README.md).
