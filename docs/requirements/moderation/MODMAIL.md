# Modmail

Modmail is the community moderation messaging channel between users and community moderators.

## Scope

- Services: `backend/services/modmail/`
- Messaging primitives: conversations and conversation messages
- Surface: community moderation/settings messaging UI

## Behavior

Users can contact community moderators about community-scoped moderation issues, including removals and bans. Moderators respond from the community context rather than from personal inboxes.

## Authorization

| Actor                     | Capabilities                                    |
| ------------------------- | ----------------------------------------------- |
| Community member/user     | Start or reply to their own modmail thread      |
| Community owner/moderator | View and reply to threads for their community   |
| Administrator             | Platform support and abuse investigation access |

Modmail is not a general appeals system. General post-removal appeals are tracked separately.

See also: [What Happens When Content Is Removed](../../../articles/what-happens-when-content-is-removed.md).
