# modmail

Service for community modmail — threaded mod↔member channels scoped to a community.
Wraps `conversations` (channel_type='modmail'), `conversation_participants`, and
`community_saved_replies`.

List reads follow the [cursor pagination contract](../../../docs/overview/architecture/pagination.md).
Thread cursors carry the exact PostgreSQL microsecond timestamp plus UUID tie-breaker. Saved reply
cursors carry `(order_index, id)`. Services accept decoded cursor objects and return one extra
candidate row so API routes can derive accurate page metadata.

Modmail cursors contain ordering keys rather than community IDs. Every route resolves the community,
checks membership or staff authorization, and applies the community/thread predicate before the
keyset boundary. Cross-path replay therefore cannot expose source-community rows, and supported
clients reset traversal on community or thread changes.

## Functions

- `openModmailThread(currentUserId, communityId, subjectUserId)` — open a modmail thread
- `getCommunityModmailInbox(communityId, opts)` — list all threads (mod shared inbox)
- `assignModmailThread(conversationId, modUserId)` — assign to a mod
- `resolveModmailThread(conversationId, resolvedBy)` — mark resolved
- `getCommunitySavedReplies(communityId)` / `createSavedReply` / `deleteSavedReply` — manage templates

Note: modmail intentionally bypasses block/mute checks. `processConversationMessageNotification`
skips `isUserBlockedOrMuted` when `channel_type === 'modmail'` because modmail is official
community communication and must reach the subject user regardless of their block settings.
