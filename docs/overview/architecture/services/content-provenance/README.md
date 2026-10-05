# @services/content-provenance

Source entrypoint: [backend/services/content-provenance/README.md](../../../../../backend/services/content-provenance/README.md)

Decides what a viewer may learn about how a post was created. The rules, the four label tiers, the
anonymous-post rule and the routes that carry the label are in
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
- `labelAndMaskPosts(posts, currentUser)` attaches the label and then masks anonymous authors.

## Calling rules

- Call it after the entity-cache read, on posts the viewer may already see. It never checks access.
- Attach before `maskAnonymousPosts`. Masking clears `created_by_id`, which the anonymous-post rule
  needs to tell the author and administrators from everyone else.
- Never write the fields onto a cached post. The channel and client stay out of the cached `Post` and
  out of `view_posts`, so a rename or an unverify shows on the next read.
- MCP read tools call `toMcpPosts`, which attaches the signed-out label. Staff provenance is REST
  only.
- Author mutation echoes, omnisearch and the lean MCP search summaries do not call it.

## Tests

`resolve-public-provenance-label.test.mts` is the table test for every tier and channel.
`attach-post-provenance.test.mts` covers the viewers, anonymous posts and the rename and unverify
case against the database.
