# Community List, List Membership and Membership Plan Read Tools

Four MCP read tools cover a community's curated list, which of the caller's own lists hold a post or
feed item, and the membership plans Voucha sells. Each is read-only (`readOnlyHint`), names its REST
twin in `meta.api`, sits on the `internal`, `mcp` and `client` surfaces, and needs no paid plan. The
generated [tool catalog](catalog.md) holds each tool's description and scopes; the
[agent tools overview](README.md) covers metadata and plan gating, and the
[hostname, list and user read tools](hostname-list-user-read-tools.md) describe the result shape
and paging rules these tools share.

| Tool                             | REST twin                                             | Scope                 | Arguments                                          |
| -------------------------------- | ----------------------------------------------------- | --------------------- | -------------------------------------------------- |
| `get_community_list_items`       | `GET /api/v1/communities/:idOrSlug/list-items/{type}` | `communities:read`    | `community_id`, `item_type`, `limit`, `after`      |
| `get_community_list_item_counts` | `GET /api/v1/communities/:idOrSlug/list-items/counts` | `communities:read`    | `community_id` (UUID or slug)                      |
| `get_my_lists_containing`        | `GET /api/v1/lists/contains`                          | `lists:read`          | `item_type` (`post`, `rss_feed_item`), `entity_id` |
| `get_membership_plans`           | `GET /api/v1/memberships/plans`                       | `reference-data:read` | none                                               |

No scope is new, and `mcp.user:read` already covers all three. Each tool owns a closed output
schema built from the generated REST contracts, and the result is `{ success: true, ... }` or
`{ success: false, error }`, so a missing community and a malformed cursor never surface as a tool
failure.

## Community list items

The community list holds five kinds of entry, one REST route each: `topic` (`topics`), `rss_feed`
(`rss-feeds`), `post` (`posts`), `url_hostname` (`domains`) and `url` (`urls`). Both community
tools load the community as a signed-out reader does, whoever is calling, so a private, deleted or
unknown community returns `{ success: false, error: "Community not found" }`, even to its owner
or a member.

`get_community_list_items` returns one `item_type` at a time, in list order (`order_index`, then
id), at most 25 entries per page (default 20). Each entry is `{ id, item_type, entity_id,
order_index, created_at, label }`; `added_by_id` and `community_id` stay out. `label` names the
entity where no other tool reads it by id: the hostname for `url_hostname`, the page URL for `url`
and the feed title for `rss_feed`, each sanitized as a title, or `null` when the entity can no
longer be read. A `topic` or a `post` has a `null` label; read it with `get_topic_details` or
`get_post`. A post the public cannot see, such as a private or deleted one, is filtered in the
query, so a page is full while more entries exist. The cursor is the REST cursor, so it round-trips
with the signed-out route.

`get_community_list_item_counts` returns `{ topic, rss_feed, post, url_hostname, url }` as the
signed-out route does, with `post` counting only what the public can see.

## Lists containing an entity

`get_my_lists_containing` answers which of the caller's own lists hold a post or an RSS feed item,
newest list first, as `list_ids` to read with `get_list`. It never searches another user's lists.
Public and unlisted lists are always searched. A private list is searched only when the credential
holds the exact `post-relations.owned-private:write` grant, which `mcp.user:write` does not imply;
without it a private list is left out as though it did not exist, the same rule `get_my_lists` and
`get_list` apply. REST has no such gate because a signed-in session sees its own private lists. A
removed list never appears, and an entity on no list returns an empty `list_ids`. An `entity_id`
that is not a UUID is refused by the schema, and a direct call returns `{ success: false, error:
"Invalid entity_id" }`. `getListsContainingEntity` takes an `includePrivate` option for this;
REST leaves it unset and keeps every list.

## Membership plans

`get_membership_plans` returns the catalog signed-out REST returns: `products`, the purchasable
plans (`plus` or `pro`, by billing interval, with each store's product reference and a price of
minor units and a currency, or `null`), and `benefit_catalog`, the versioned benefits by group with
the value each plan gets. It says nothing about the caller: not their plan, entitlements or billing.
The REST route is public, and `reference-data:read` is the closest scope, because there is no
membership scope and the data is the same for everyone.

## Routes without a tool

The other `/api/v1/memberships` routes (the caller's own membership and history, purchase intents,
the billing portal, store notifications, grants and refunds) carry billing state or store and staff
flows, and have no tool here. Changing a community list or a user list stays with the community
moderators and the list write tools.
