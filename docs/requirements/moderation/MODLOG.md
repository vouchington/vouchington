# Moderation Log

The modlog is the unified audit trail for moderation actions.

The modlog and moderation analytics are intentionally read-only capabilities. Swift and .NET have
full parity for those reads; this does not imply parity for adjacent moderation queue actions. See
the [Client Parity Matrix](../CLIENT-PARITY-MATRIX.md).

## Scope

- Table: `moderator_actions`
- Service: `backend/services/moderator-actions/`
- Routes: `GET /api/v1/admin/modlog` and community modlog routes

## Data Model

Each row stores an actor, action type, optional community/post/user/report/dispute/application target, optional reason, and structured metadata.

`actor_id` is nullable for historical rows, but new automated moderation actions should use the `automod` system user. Ban-evasion reports continue to use the `ban-evasion` system user because redaction depends on that identity.

## Action Families

- Post/community review: `approve`, `reject`, `remove`, `pin`, `unpin`
- User/community enforcement: `ban`, `lift_ban`, `warn`, `lock`, `unlock`, `remove_member`, `change_role`
- Restrictions: `activate_restriction`, `lift_restriction`
- Reports: `resolve_report`, `dismiss_report`
- Platform enforcement: `suspend`, `unsuspend`, `tag`

See also: [Moderation System Users](./MODERATION-SYSTEM-USERS.md).
