# @services/user-warnings

Issues and retrieves formal warnings sent to users by moderators or admins.

## Data model

`user_warnings` — a row is created each time a moderator or admin formally warns a user.

| Column           | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `id`             | UUIDv7 primary key                                        |
| `user_id`        | The user who received the warning                         |
| `community_id`   | NULL = global warning; non-NULL = community-scoped        |
| `issued_by_id`   | The moderator or admin who issued the warning             |
| `reason`         | Internal reason (visible to staff only)                   |
| `public_message` | Optional message shown to the warned user                 |
| `report_id`      | The moderation report that triggered this warning, if any |
| `created_at`     | Timestamp of when the warning was issued                  |

Warnings are **append-only** — no `updated_at` or `deleted_at` columns. They are immutable once created.

Warnings for the author of an anonymous post are acceptable as a staff-only action: the warning is not a public attribution of the anonymous content.

## Usage

```typescript
import {
  createUserWarning,
  listReceivedUserWarnings,
  listIssuedUserWarnings,
  currentUserCanIssueUserWarning,
  currentUserCanViewUserWarnings,
} from '@services/user-warnings'
```

After a warning is created, a notification is automatically sent to the warned user via `createUserWarningNotification` from `@services/notifications`. The notification links to `/my/warnings`.

## Authorization

- `currentUserCanIssueUserWarning` — true for site admins and site moderators
- `currentUserCanViewUserWarnings` — true for site admins and site moderators
