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
root check. Descendant reads work top-down: page the requested post's immediate-child heads, then
attach bounded previews below those heads. Head reads, children per head, total preview work and
relative depth have runtime limits with hard ceilings. Filtering consumes the read budget instead
of searching the rest of the thread to fill the page.

Each response is ordered by comment id, but concatenated pages are not a globally ordered list of
all descendant ids. The opaque continuation cursor advances past the last inspected head, including
a head omitted after placeholder classification. A short or empty response may therefore have a
continuation cursor. Clients continue according to `page_info`, never the number of returned rows.
`has_next_page` describes remaining heads; it does not say every reply below a returned head was
included in its preview.

Opening any returned comment, including a placeholder, starts a new bounded window through the
same descendants operation rooted at that comment. Clients preserve that expansion path even when
a preview stops before the usual deep-thread link. The web's comment permalink provides it without
an eligibility flag or a second expansion endpoint.

- A deleted comment, or one without `approved_at`, comes back as a placeholder: no text, no author,
  and `placeholder_state` set to `deleted` or `unmoderated`. The comment's author and moderation staff
  still see an uncleared comment as it is.
- A placeholder is shown only so the valid replies below it keep their place. One with no valid reply
  below it is left out when the bounded look-down can establish that, including on a read by id.
- The look-down for that valid reply passes only through placeholders and stops at the first valid
  one. A placeholder whose preview cannot establish whether a valid reply exists uses this bounded
  look-down. Its depth and row caps are dynamic config with hard maximums.
  Reaching a cap keeps the
  placeholder: the reader sees one that may have nothing under it, never a missing branch.
- `GET /posts/:id/ancestors` returns placeholders for deleted or unmoderated ancestors instead of a 404. Clients that treated a missing ancestor as an error must treat `placeholder_state` as content
  that is not there.
- A signed-in viewer's `hide` bookmark on a comment collapses it in the thread and nothing else (see
  [bookmarks](../../overview/architecture/bookmarks.md#hide-on-a-comment)). The descendants walk
  returns a hidden comment but not what is below it; opening it loads its replies from that comment.
  MCP applies the shared signed-out read guards and pagination bounds, so a viewer's hide never
  shortens its preview. A signed-out reader
  collapses in the browser within the same bounded window.

Global-to-community cross-posts are community-scoped `discussion` posts with `parent_post_id` pointing to
the public global source post. They are not comments and must not appear in the source post's comment
tree.
