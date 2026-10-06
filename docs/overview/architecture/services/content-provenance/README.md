# @services/content-provenance

Source entrypoint: [backend/services/content-provenance/README.md](../../../../../backend/services/content-provenance/README.md)

Decides what a viewer may learn about how a post, community, topic, list or RSS feed was created.
The rules, the four label tiers, the anonymous-post rule, the scope rule and the routes and MCP
tools that carry the label are in
[Content provenance exposure](../../../../requirements/content/reference-content-provenance-exposure.md).
This page covers how to call the service.

## Exports

- `resolvePublicProvenanceLabel(createdVia, client)` returns `{ via, app }` for `api` and `mcp` rows
  and `null` for every other channel. `app` is `{ kind: 'known', key }` for the reviewed allowlist in
  `@services/oauth-authorization-server/known-clients`, then `{ kind: 'hostname', hostname }` for the
  CIMD hostname, then `{ kind: 'verified', client_id, client_name }` for a staff-verified client,
  then `null`. It returns facts, and each client composes the wording.
- `buildStaffProvenance(createdVia, client)` returns the raw channel and OAuth client for moderation
  staff.
- `getPostProvenanceFacts(postIds)` reads `posts LEFT JOIN oauth_clients` for already-visible ids in
  one query and returns a map by post id.
- `attachPostProvenance(posts, currentUser)` runs the read, applies the rules for that viewer and
  returns copies of the posts with `provenance` and, for administrators and moderators,
  `staff_provenance` set.
- `attachWrittenPostProvenance(post, viewer)` labels the one post a write route or tool just wrote,
  with the same rules as a read for `viewer`, reading the primary instead of a replica.
- `labelAndMaskPosts(posts, currentUser)` attaches the label and then masks anonymous authors.
- `getCommunityProvenanceFacts`, `getTopicProvenanceFacts`, `getListProvenanceFacts` and
  `getRssFeedProvenanceFacts` (`entity-facts.mts`) each read their table (`communities`, `topics`,
  `user_lists`, `rss_feeds`) `LEFT JOIN oauth_clients` for already-visible ids in one query and
  return a map by entity id. An empty id list runs no query.
- `attachCommunityProvenance`, `attachTopicProvenance`, `attachListProvenance` and
  `attachRssFeedProvenance` take `(entities, currentUser, options)`, apply the rules for that
  viewer and return copies with `provenance` and, for administrators and moderators,
  `staff_provenance` set. They read a replica unless `options` says `{ readOnly: false }`. Null
  entries and entities with no facts pass through unchanged.
- `attachWrittenCommunityProvenance`, `attachWrittenTopicProvenance`,
  `attachWrittenListProvenance` and `attachWrittenRssFeedProvenance` take `(entity, viewer)`, label
  the one entity a write route or tool just wrote and read the primary.

## Calling rules

- Call it after the entity-cache read, on posts the viewer may already see. It never checks access.
- Attach before `maskAnonymousPosts`. Masking clears `created_by_id`, which the anonymous-post rule
  needs to tell the author and administrators from everyone else.
- Never write the fields onto a cached post. The channel and client stay out of the cached `Post` and
  out of `view_posts`, so a rename or an unverify shows on the next read.
- MCP read tools call `toMcpPosts`, which attaches the signed-out label. Staff provenance is REST
  only.
- Write routes call `attachWrittenPostProvenance` on the response with the signed-in writer. The MCP
  `create_post` and `update_post` tools call it through `toWrittenMcpPost` with no viewer. Never call
  it on a post that is stored: an idempotent replay replays the stored post, and the replay's label
  must still reflect the client's current name and verification.
- Omnisearch and the lean MCP search summaries do not call it.

### Entities

- Call the entity helper on the whole page of ids in one call, after the cached read: a route
  chains it after the batch fetch (`getTopicByAnyCachedBatch(...).then(attachTopicProvenance)`) or
  runs it beside other reads. Never call it per entity in a loop.
- Never write the fields onto a cached `Community`, `Topic`, `List` or `ViewRssFeed`, and never add
  the columns to a view. The schema test fails if a view references them.
- Label every full entity object a response serializes: the primary payload and the `topics`,
  `rss_feeds`, `communities` and `lists` sidecar maps. Slim records and nested entities, such as
  the `topic` of a `ViewRssFeed`, stay unlabeled.
- A route that already read the entity from the primary passes `{ readOnly: false }`. The list
  detail route and the MCP `get_list` do, so the facts match the row they labeled.
- Write routes and the MCP `create_list` and `update_list` call the `attachWritten*` helper on the
  response with the signed-in writer, or `null` for MCP. Creating an RSS feed returns ids, so it
  calls none.
- MCP read outputs attach the signed-out label through `toMcpLists`, `toMcpCommunityEntries` and
  `toMcpRssFeeds`, and `get_topic_details` calls `attachTopicProvenance` with `null`.
  `staff_provenance` never reaches MCP.
- Pass the signed-in viewer on every REST route. Without one, staff never get `staff_provenance`.

### Where it is wired

- Communities: `communities`, `community`, `automod-settings`, `post-type-settings`,
  `list-items-topics` and `list-items-rss-feeds` under `backend/api/v1/communities`, and the
  communities collection under `backend/api/v1/users`.
- Topics: `topics`, `topic-detail-route`, `compare`, `merges`, the trending and recommended topic
  routes, the top hashtags route and the topics collection under `backend/api/v1/users`.
- Lists: `lists` and `list` under `backend/api/v1/lists`.
- RSS feeds: `rss-feeds`, `rss-feed` and the trending and recommended RSS feed routes under
  `backend/api/v1/rss-feeds`, and the RSS feeds collection under `backend/api/v1/users`.
- Hostnames and the fediverse: the hostname list, detail, top, social and compare routes label the
  topics and feeds they return, and the fediverse instance routes label their topics.
- MCP: `get_community`, `search_communities`, `get_list`, `get_my_lists`, `create_list`,
  `update_list`, `get_topic_details`, `get_rss_feed` and `search_rss_feeds`.

## Tests

`resolve-public-provenance-label.test.mts` is the table test for every tier and channel.
`attach-post-provenance.test.mts` covers the viewers, anonymous posts and the rename and unverify
case against the database. `attach-entity-provenance.test.mts` covers the same viewers, the copies
and the pass-through rules, and a freshly written entity read from the primary, for the four entity
kinds.
