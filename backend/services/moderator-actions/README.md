# @services/moderator-actions

Append-only unified log of moderator and admin actions across the platform.

## Data model

`moderator_actions` — see migration `0420-00-00-moderator-actions.sql`.

| Column                     | Type           | Description                                                                                                                                                                                          |
| -------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | `uuid`         | UUIDv7 primary key; ordering and pagination proxy for `created_at`                                                                                                                                   |
| `community_id`             | `uuid \| null` | Community scope; `NULL` for global/platform-level actions                                                                                                                                            |
| `actor_id`                 | `uuid \| null` | Moderator/admin who took the action (`ON DELETE SET NULL` for audit persistence)                                                                                                                     |
| `action_type`              | `text`         | One of `remove`, `approve`, `reject`, `ban`, `lift_ban`, `warn`, `lock`, `unlock`, `pin`, `unpin`, `tag`, `suspend`, `unsuspend`, `remove_member`, `change_role`, `resolve_report`, `dismiss_report` |
| `post_id`                  | `uuid \| null` | Target post or comment                                                                                                                                                                               |
| `target_user_id`           | `uuid \| null` | Target user for bans, suspensions, warnings, member actions                                                                                                                                          |
| `report_id`                | `uuid \| null` | Target moderation report                                                                                                                                                                             |
| `review_dispute_id`        | `uuid \| null` | Target review dispute                                                                                                                                                                                |
| `community_application_id` | `uuid \| null` | Target community application                                                                                                                                                                         |
| `reason`                   | `text \| null` | Optional free-text reason                                                                                                                                                                            |
| `metadata`                 | `jsonb`        | Structured context snapshot (e.g. role for `change_role`, topic slugs for `tag`)                                                                                                                     |
| `created_at`               | `timestamptz`  | Virtual, derived from UUIDv7 `id` via `uuid_extract_timestamp()`                                                                                                                                     |

At least one of the entity FK columns must be non-null (enforced by a CHECK constraint).

## Usage

### Writing a log entry

```ts
import { recordModeratorAction } from '@services/moderator-actions'

// Inside a moderation action, composing with its transaction:
await recordModeratorAction(
  currentUser.id,
  {
    actionType: 'ban',
    communityId: community.id,
    targetUserId: targetUser.id,
    reason: 'Spam',
  },
  options, // pass QueryOptions to run inside the caller's transaction
)
```

### Querying the log

```ts
import { searchModeratorActions } from '@services/moderator-actions'

const { results, page_info } = await searchModeratorActions({
  communityId: community.id,
  actorId: moderator.id,
  actionType: 'ban',
  limit: 25,
  after: cursor,
})
```

## Authorization

- `currentUserCanViewCommunityModlog(currentUser, community, membership)` — `true` for owners, moderators, and moderation staff.
- Global admin access is gated by `isAdminUser` from `@services/users`.
