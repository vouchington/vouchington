# community-member-vacations

Source entrypoint: [backend/services/community-member-vacations/README.md](../../../../../backend/services/community-member-vacations/README.md)

Self-service vacation flag for community moderators. A moderator can mark themselves as
"on vacation" for a community, which excludes them from new escalation-thread participants
and modmail notification recipients while the vacation is active.

## Data model

`community_member_vacations (community_id, user_id, starts_at, ends_at, created_at)`

The independent `community_members.should_suppress_community_digests_while_on_vacation` preference defaults to false. Setting or clearing a vacation never changes it, and changing it never changes the vacation period.

- One row per moderator per community; upsert to set, delete to clear.
- Active predicate: `starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`
- `ends_at IS NULL` means "until I turn it off".

## Usage

```ts
import {
  setMyCommunityVacation,
  clearMyCommunityVacation,
  getMyCommunityVacationSettings,
  currentUserCanSetOwnModeratorVacation,
} from '@services/community-member-vacations'

// Set (or extend/update) a vacation
await setMyCommunityVacation(userId, { communityId, endsAt: '2026-07-01T00:00:00Z' })

// Permanent (until turned off)
await setMyCommunityVacation(userId, { communityId })

// Clear
await clearMyCommunityVacation(userId, { communityId })

// Read own status
const { vacation } = await getMyCommunityVacationSettings(userId, { communityId })
```

## Business-time dependency

`setMyCommunityVacation`, `getMyCommunityVacation`, and `getMyCommunityVacationSettings`
accept an optional internal third argument `{ clock: () => Date }`. Each operation samples
and validates a finite Date once before its query. Set/upsert binds that business time into
`starts_at`; both read predicates use the same observed time. A thrown clock error or invalid
Date rejects before writing. Clear and preference setters have no clock dependency.

Omitting the dependency retains native PostgreSQL `now()` for starts and reads. `created_at`
and `updated_at` remain native audit defaults/triggers. REST callers omit the dependency,
and the downstream exclusion queries below retain their native clock. An injected service
as-of time does not change the database clock or make all downstream readers logical.

The direct-module `getMyCommunityVacation` reader is not exported by the service barrel;
the public example uses the existing exported `getMyCommunityVacationSettings`.

## Exclusion surfaces

Vacation exclusion is applied inline in SQL subqueries at these exclusion surfaces:

1. `backend/services/moderation-threads/create.mts` — `addModParticipants()`: on-vacation
   mods are excluded from the `mod_internal` thread participant insert.
2. `backend/services/notifications/get-conversation-notification-context.mts` — modmail
   recipient query: on-vacation mods are excluded from notification dispatch.
3. Community moderation-summary email and in-app weekly digest queries suppress the community only when the independent digest preference is enabled and the vacation is active.
