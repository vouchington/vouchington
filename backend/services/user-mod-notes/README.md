# user-mod-notes

Private moderator notes on users. Community-scoped (`community_id` set) or global (`community_id` NULL).

## Visibility

- Site admins/moderators (`isModerationStaff`) see all notes.
- Community moderators see only notes for communities they currently moderate; global notes are hidden.

## API

- `createUserModNote(currentUser, { targetUserId, communityId, body })` — create a note.
- `listUserModNotes(currentUser, targetUserId, options)` — list notes, visibility-filtered.
- `deleteUserModNote(currentUser, noteId)` — soft-delete a note.
- `getUserModerationContext(currentUser, targetUser, isStaff)` — aggregate user moderation context (account age, trust tier, removal counts, active suspension).
