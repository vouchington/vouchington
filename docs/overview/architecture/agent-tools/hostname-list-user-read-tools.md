# Hostname, List and User Read Tools

Seven MCP read tools read hostnames, lists and public user profiles. Each is read-only
(`readOnlyHint`), names its REST twin in `meta.api`, sits on the `internal`, `mcp` and `client`
surfaces, and needs no paid plan. The generated [tool catalog](catalog.md) holds each tool's
description and scopes; the [agent tools overview](README.md) covers metadata and plan gating, and
the [post, story and community read tools](../services/mcp-tools/read-tools.md) share the result
shape and paging rules described here.

| Tool                | REST twin                     | Scope            | Arguments                                                                     |
| ------------------- | ----------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| `search_hostnames`  | `GET /api/v1/hostnames`       | `hostnames:read` | `query`, `hostname`, `topic` (UUID or slug), `sort` (trust), `limit`, `after` |
| `get_top_hostnames` | `GET /api/v1/hostnames/top`   | `hostnames:read` | `topic` (UUID or slug), `limit`, `after`                                      |
| `get_my_lists`      | `GET /api/v1/lists`           | `lists:read`     | `limit`, `after`                                                              |
| `get_list`          | `GET /api/v1/lists/:id`       | `lists:read`     | `list_id`                                                                     |
| `get_list_items`    | `GET /api/v1/lists/:id/items` | `lists:read`     | `list_id`, `media_type`, `limit`, `after`                                     |
| `get_user`          | `GET /api/v1/users/:idOrSlug` | `users:read`     | `user_id` (UUID or username)                                                  |
| `search_users`      | `GET /api/v1/users`           | `users:read`     | `q`, `limit`, `after`                                                         |

`hostnames:read` and `users:read` are resource scopes covered by the `mcp.user:read` umbrella
([scope policy](../backend/modules/scopes/README.md)); `lists:read` already gated the list write
tools. Each tool owns a closed output schema picked from the generated REST contracts, and the
result is `{ success: true, ... }` or `{ success: false, error }`, so a missing list or user and a
malformed cursor never surface as a tool failure. Paged tools take `limit` 1 to 25 (the
signed-out cap, even where REST allows more; defaults are 25 for hostnames, 20 for lists and 10
for users) and return `page_info`, whose `end_cursor` is passed back as `after` with the same sort
or query. A malformed cursor, or one minted by another sort or query, returns
`{ success: false, error: "Invalid cursor" }`.

## Hostnames

Both hostname tools read as a signed-out reader for every caller, so an administratively blocked
hostname never appears, even to an administrator, and no moderation filter or viewer sidecar is
reachable. Each result is `{ id, hostname, topic_id, election }`, where `election` holds the public
trust vote totals (`votes_count_up`, `votes_count_down`, `votes_score_net`) or is `null`. A `topic`
that does not exist returns an empty page. `search_hostnames` sorts by hostname, or by net trust
votes with `sort: "trust"`; `get_top_hostnames` lists hostnames with at least one trust vote up.

## Lists

A public or unlisted list is readable by anyone who holds its id, as on the REST routes. A private
list is readable only by its owner, and only when the credential also holds the exact grant
`post-relations.owned-private:write`, the consent the entity-relation write tools already demand
before they touch an owner's private post. The grant is `requiresExactGrant`, so `mcp.user:write`
and `lists:read` never satisfy it, and a credential that carries it also needs
`entity-relations:read` and `entity-relations:write`. Without the grant `get_my_lists` leaves
private lists out of the page and its cursor as if they did not exist.

Every denial is the same `{ success: false, error: "List not found" }`: another user's private
list, a private list read without the grant, a removed list, an unknown id and a malformed id
cannot be told apart. `loadReadableList` (`backend/tools/list-read-access.mts`) decides this for
`get_list` and `get_list_items`, and `hasOwnedPrivateGrant` answers false instead of throwing, so a
read never reveals which condition failed.

`get_list_items` returns post and RSS feed items with the `item_type` and `entity_id` to read them
with. Each post goes through `resolveReadableThread`, the policy `get_post` uses, so a private,
deleted or hidden post is left out and a public list is never a way around a private post. A page
can therefore hold fewer items than `limit` while `page_info.has_next_page` is still true; keep
paging until it is false. List descriptions are wrapped with `wrapExternalContent` and names are
sanitized.

## Users

Both user tools return the signed-out public profile for every caller: the caller's own account,
another user and an administrator all see `{ id, username, markdown, verification_status,
is_verified_badge_visible, verified_display_name, is_official_account }` and nothing else, never an
email address, phone number or suspension. A deleted or unknown user is
`{ success: false, error: "User not found" }`. `get_user` takes a UUID or a username (case
insensitive) and refuses an email address or phone number as an invalid identifier. The verified
name appears only while the user shows the verified badge. `search_users` matches the start of a
username, A to Z, treats a LIKE wildcard as plain text, and returns nothing for a blank query, an
email address or an id. The bio is wrapped with `wrapExternalContent`.
