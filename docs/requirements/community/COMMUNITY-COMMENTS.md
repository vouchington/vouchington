# Community Comments

Comments inherit community scope from the post or comment they reply to. A comment cannot choose a
different community from its parent.

## Behavior

- Comments on global posts have `community_id = NULL`.
- Comments on community posts have the same `community_id` as the parent/root.
- Replies inherit the immediate parent's `community_id`.
- Comment descendants only include `post_type='comment'`.

Global-to-community cross-posts are community-scoped `discussion` posts with `parent_post_id` pointing to
the public global source post. They are not comments and must not appear in the source post's comment
tree.
