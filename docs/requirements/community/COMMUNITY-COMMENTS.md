# Community Comments

Comments inherit community scope from the post or comment they reply to. A comment cannot choose a
different community from its parent.

## Behavior

- Comments on global posts have `community_id = NULL`.
- Comments on community posts have the same `community_id` as the parent/root.
- Replies inherit the immediate parent's `community_id`.
- Comment descendants only include `post_type='comment'`.

## Reading a thread

REST and MCP return the same thread. A reply is readable when it and the thread root pass the usual
read rules; nothing between them can hide it, so there is no upward walk. Blocked post types are a
root check. Descendant reads stop at a configurable depth relative to the requested root or comment.
The window includes the child level needed by the UI's deeper-replies link. Opening a comment starts a
new window, so the depth bound does not make deeper replies unreachable.

- A deleted comment, or one without `approved_at`, comes back as a placeholder: no text, no author,
  and `placeholder_state` set to `deleted` or `unmoderated`. The comment's author and moderation staff
  still see an uncleared comment as it is.
- A placeholder is shown only so the valid replies below it keep their place. One with no valid reply
  below it is left out when the bounded look-down can establish that, including on a read by id.
- The look-down for that valid reply passes only through placeholders and stops at the first valid
  one. A hidden placeholder or a placeholder at the descendant window boundary uses this look-down
  because its children were not loaded. Its depth and row caps are dynamic config with hard maximums.
  Reaching a cap keeps the
  placeholder: the reader sees one that may have nothing under it, never a missing branch.
- `GET /posts/:id/ancestors` returns placeholders for deleted or unmoderated ancestors instead of a 404. Clients that treated a missing ancestor as an error must treat `placeholder_state` as content
  that is not there.
- A signed-in viewer's `hide` bookmark on a comment collapses it in the thread and nothing else (see
  [bookmarks](../../overview/architecture/bookmarks.md#hide-on-a-comment)). The descendants walk
  returns a hidden comment but not what is below it; opening it loads its replies from that comment.
  The MCP walk has no viewer, so hide never shortens its depth-bounded window. A signed-out reader
  collapses in the browser within the same bounded window.

Global-to-community cross-posts are community-scoped `discussion` posts with `parent_post_id` pointing to
the public global source post. They are not comments and must not appear in the source post's comment
tree.
