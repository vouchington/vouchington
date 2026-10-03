# Own Profile, Notification and Preference Read Tools

Six MCP read tools return the caller's own bio, profile links, notifications, email preferences
and settings. They are the reads for the
[profile, notification and preference write tools](profile-notification-write-tools.md): each
reads what one of those tools changes. Each is read-only (`readOnlyHint`), names its REST twin in
`meta.api`, sits on the `internal`, `mcp` and `client` surfaces, and needs no paid plan. The
generated [tool catalog](catalog.md) holds each tool's description and scopes; the
[agent tools overview](README.md) covers metadata and plan gating.

| Tool                          | REST twin                                  | Scope                | Arguments        |
| ----------------------------- | ------------------------------------------ | -------------------- | ---------------- |
| `get_my_notifications`        | `GET /api/v1/my/notifications`             | `notifications:read` | `limit`, `after` |
| `get_my_unread_notifications` | `GET /api/v1/my/notifications/unread`      | `notifications:read` | none             |
| `get_my_bio`                  | `GET /api/v1/my/profile`                   | `profile:read`       | none             |
| `get_my_profile_links`        | `GET /api/v1/my/profile/links`             | `profile:read`       | none             |
| `get_my_email_preferences`    | `GET /api/v1/my/email-preferences`         | `preferences:read`   | none             |
| `get_my_preferences`          | `GET /api/v1/users/:idOrSlug` (own record) | `preferences:read`   | none             |

No scope is new, and `mcp.user:read` already covers all three. Every tool acts on the credential's
own account and takes no user id, so another user's data cannot be asked for. Each re-reads that
account from the primary database before it reads anything, so an account deleted after the
credential was issued is refused with `401` instead of still returning the rows that outlive it.
Each owns a closed output schema built from the generated REST contracts, and a test pins every
property to the documented response.

## Notifications

`get_my_notifications` lists every notification, read or not, newest first, at most 100 per page
(default 25), the REST bounds. `results` lists the notification ids in order, `notifications`
holds each one by id and `communities` holds the public communities, or the caller's own, they
mention. `page_info.end_cursor` is the REST cursor, so it round-trips with the route; a malformed
cursor, an empty one included, returns `{ success: false, error: "Invalid cursor" }`.

`get_my_unread_notifications` returns `unread_count`, the total, and the newest 10 unread
notifications in the same three records.

A notification's `title`, `actor_label` and a community's `name` can quote other users, so they are
sanitized as titles. The `body` is sanitized and fenced as `external-content` from `notification`.
An empty body, as a direct message has, stays an empty string, the REST type. A notification has no
`target_path`: that is a frontend route, and the tools return what it is about as `target_entity`,
`target_intent` and the ids of the records it points at. Reading never marks
a notification read; `mark_notification_read` and `mark_all_notifications_read` do that.

## Profile

`get_my_bio` returns `{ id, markdown }` exactly as stored, an empty string when there is no bio.
It is the account's own text, so it is neither sanitized nor fenced, and what it returns can be
edited and sent back to `update_my_bio` unchanged. `get_my_profile` reads the wallet profile
instead.

`get_my_profile_links` returns the links in display order with the fields REST returns. There are
at most 20, so the list is not paged. A link's `name`, `handle` and `url` are the account's own
text and are not sanitized. The ids go to `update_my_profile_link`, `delete_my_profile_link` and
`reorder_my_profile_links`.

## Email preferences and settings

`get_my_email_preferences` returns `email_preferences`: which digests and summaries the caller
receives, and their cadence, weekdays, time of day and time zone. Email addresses are not part of
it.

`get_my_preferences` returns `settings`, the twelve fields `update_my_preferences` changes: who can
see the caller's follows, followers, likes and community memberships, who can message them, the
default audience and privacy of new posts, country, interface locale and Hacker News discussions.
They are read from the account's private user record on the primary database, so a read straight
after an update sees it. A field the account has never set is `null`. Financial-data visibility,
consents, federation, email addresses, sign-in settings and the username are not included.

## Routes without a tool

Credentials, email addresses, sessions, API keys, OAuth applications and push subscriptions carry
secrets or sign-in state and have no read tool. `GET /api/v1/my/notifications/:id/redirect-target`
marks the notification read, so it is not a pure read and has none either.
