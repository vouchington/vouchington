# Moderator Notes

Moderator notes are private staff notes about a user.

## Scope

- Table: `user_mod_notes`
- Services: `backend/services/user-mod-notes/`
- Audit: note creation writes `moderator_actions` when the service records an action

## Privacy

Moderator notes are never exposed to the target user, public profile viewers, or ordinary community members. Community-scoped notes are visible only to moderators for that community plus platform staff. Global notes are platform-staff only.

## Authorization

| Scope     | Who can create/view                      |
| --------- | ---------------------------------------- |
| Community | Community owner/moderator, administrator |
| Global    | Moderator, administrator                 |

Create and delete routes require the acting moderator or staff member to be unsuspended and to
currently satisfy the same mod-note access gate used by listing. Authorship alone is not enough to
delete a note after a user loses moderation access.

Notes are context for future moderation decisions; they are not penalties and do not alter account state.

See also: [Community Bans](./COMMUNITY-BANS.md), [User Warnings](./USER-WARNINGS.md).
