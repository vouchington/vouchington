# Community Comments

Comments inherit community scope from the post or comment they reply to. A comment cannot choose a
different community from its parent.

## Behavior

- Comments on global posts have `community_id = NULL`.
- Comments on community posts have the same `community_id` as the parent/root.
- Replies inherit the immediate parent's `community_id`.
- Comment descendants only include `post_type='comment'`.

Global-to-community cross-posts are community-scoped `discussion` posts with `parent_id` pointing to
the public global source post. They are not comments and must not appear in the source post's comment
tree.

## API

### POST /api/v1/posts

When creating a comment (`post_type: 'comment'`):

- `parent_id` is required.
- `community_id` is rejected because the parent determines scope.
- `broadcast` and `privacy` are forced to `everyone/public`.

### GET /api/v1/posts/:id/descendants

Returns comment descendants for the root/subtree. Community filter query params are no longer part
of this API.

## Data Model

- `posts.community_id` (UUID, nullable): FK to `communities.id`, `ON DELETE SET NULL`

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions
- [Comments service](../../../backend/services/comments/README.md)
- [Communities requirements](./COMMUNITIES.md)
