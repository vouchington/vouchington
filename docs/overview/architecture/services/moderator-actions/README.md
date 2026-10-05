# @services/moderator-actions

Source entrypoint: [backend/services/moderator-actions/README.md](../../../../../backend/services/moderator-actions/README.md)

Append-only unified log of moderator and admin actions across the platform.

## Data model

`moderator_actions` — see migration `0420-00-00-moderator-actions.sql`.

| Column                     | Type           | Description                                                                                                                                                                                          |
| -------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | `uuid`         | UUIDv7 primary key; ordering and pagination proxy for `created_at`                                                                                                                                   |
| `community_id`             | `uuid \| null` | Community scope; `NULL` for global/platform-level actions                                                                                                                                            |
| `actor_user_id`            | `uuid \| null` | Moderator/admin who took the action (`ON DELETE SET NULL` for audit persistence)                                                                                                                     |
| `action_type`              | `text`         | One of `remove`, `approve`, `reject`, `ban`, `lift_ban`, `warn`, `lock`, `unlock`, `pin`, `unpin`, `tag`, `suspend`, `unsuspend`, `remove_member`, `change_role`, `resolve_report`, `dismiss_report` |
| `post_id`                  | `uuid \| null` | Target post or comment                                                                                                                                                                               |
| `target_user_id`           | `uuid \| null` | Target user for bans, suspensions, warnings, member actions                                                                                                                                          |
| `report_id`                | `uuid \| null` | Target moderation report                                                                                                                                                                             |
| `review_dispute_id`        | `uuid \| null` | Target review dispute                                                                                                                                                                                |
| `community_application_id` | `uuid \| null` | Target community application                                                                                                                                                                         |
| `reason`                   | `text \| null` | Optional free-text reason                                                                                                                                                                            |
| `metadata`                 | `jsonb`        | Structured context snapshot (e.g. role for `change_role`, topic slugs for `tag`)                                                                                                                     |
| `created_at`               | `timestamptz`  | Virtual, derived from UUIDv7 `id` via `uuid_extract_timestamp()`                                                                                                                                     |

Targets use nullable concrete foreign keys with `ON DELETE SET NULL`. There is no non-null-target
constraint: deleting a target must not delete its audit history. Queue names, scheduled-job keys,
backfill keys and RSS category text have separate typed text columns because they are not row IDs.

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

## Staff action history

Database-backed staff mutations write their history through the same transaction as the change.
This includes appeal/dispute resolution, topic claims, report ownership/escalation, integrity reviews
and penalties, vote weights, moderation votes, note deletion, OAuth verification, crawler CRUD,
RSS-category management, story membership/official-item/title edits and staff import-batch creation. Draft edits retain before/after text in
their existing lifecycle history. OAuth verification retains the vouched-for name and redirect URIs.
Targets are typed columns, not metadata IDs. Metadata holds before/after values and operation outcomes.

External administrative operations use `recordStaffOperation`: persist `phase: requested`, execute
GlideMQ, then append `phase: finished` with `outcome: succeeded` or `failed`. The outcome's
`operation_request_action_id` references the request row. Retry-failed records attempted/retried counts,
including partial success. If the process dies or outcome persistence fails, the request remains
visible without an outcome; it does not claim success or automatically retry a possibly executed
operation. PostgreSQL cannot roll back Valkey. This exception applies to admin queue controls,
scheduled/backfill runs, article sync and queued moderation reruns, not ordinary queue processing.

Intent persistence must succeed before execution. Once execution settles, outcome persistence and
summary failures are reported through the error logger without replacing the operation's return
value or original error. The durable request remains unresolved when no outcome was saved, so an
audit outage does not turn an already completed external action into a retry-inducing error.
Deleted moderator-note bodies are not copied into history.

All these rows are available through the staff global modlog (`GET /api/v1/admin/modlog`).
Community-scoped moderation continues to appear in that community's modlog. Request-channel
provenance remains owned by #237/#611; this audit records the authenticated acting user and does
not infer that an API caller is AI-generated.
