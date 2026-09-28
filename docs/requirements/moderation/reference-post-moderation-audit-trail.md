# Post Moderation reference

[Back to Post Moderation](POST-MODERATION.md)

## Audit Trail

| Table                           | Type                                 | What it records                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post_revisions`                | Append-only                          | `revision_types: create\|update\|delete`. Migration: `backend/data-stores/psql/migrations/0075-00-00-entity-history.sql` (lines 8–27)                                                                    |
| `post_clearance_changes`        | Append-only                          | Types `approve\|reject\|mark_in_review\|reset_to_pending`. Migration: `backend/data-stores/psql/migrations/0270-00-00-post-clearance.sql` (lines 22–32)                                                  |
| `post_moderation_versions`      | Immutable                            | One content-hash and policy-revision generation, with a 30-minute hard deadline.                                                                                                                         |
| `post_moderation_work`          | Mutable projection                   | Current per-source availability, lease token, generation, and completion state.                                                                                                                          |
| `post_moderation_attempts`      | Append-only                          | At most three fenced attempts per content version and automated source.                                                                                                                                  |
| `post_moderation_dispositions`  | Append-only                          | Typed `pass\|review\|reject\|incomplete` outcomes with stable reason codes and bounded private evidence.                                                                                                 |
| `community_post_reviews`        | One-to-one projection with posts     | Tracks `approved_at`, `rejected_at`, `unpublished_at`, plus the latest platform override. Migration: `backend/data-stores/psql/migrations/0140-00-00-communities-publications.sql`                       |
| `community_post_review_changes` | Append-only                          | Community decisions and platform overrides, including public-safe reason code and staff-only private note. Migration: `backend/data-stores/psql/migrations/0630-00-00-community-post-review-history.sql` |
| `agent_moderations`             | Per-post × per-prompt × content-hash | LLM moderation results. Migration: `backend/data-stores/psql/migrations/0070-00-00-posts-feed-content.sql` (lines 454–490)                                                                               |
| `moderation_reports`            | User-submitted                       | User reports against posts, comments, users, and RSS items. Migration: `backend/data-stores/psql/migrations/0330-00-00-moderation-reports.sql` (lines 16–27)                                             |

## Database Tables

Moderation state lives across several tables:

**On `posts`:**

- `deleted_at`, `deleted_by_id` — hard delete timestamp and actor
- `archived_at`, `archived_by_id` — archive toggle
- `approved_at`, `rejected_at`, `in_review_at` — global clearance state (at most one non-null; enforced by check constraint). Migration: `backend/data-stores/psql/migrations/0270-00-00-post-clearance.sql`

Provider results do not live on `posts`. The current `llm_moderation_content_sha256` selects an
immutable `post_moderation_versions` row. Latest per-source dispositions derive the coarse
clearance projection; public eligibility reads only `approved_at`.

## Automated decision policy

- OpenAI and spam detection each receive durable attempts at T+0, T+5, and T+20. GlideMQ jobs use
  one attempt; PostgreSQL owns retries and fencing.
- At T+30 unresolved work appends `incomplete` and moves the post to staff review. It never
  publishes or rejects on provider unavailability.
- Ordinary OpenAI or spam signals append `review`. Only OpenAI's deterministic `sexual/minors`
  signal appends `reject` automatically.
- A post is approved only after both current-version automated sources append `pass`.
- Editing content changes the hash, resets clearance to pending, and makes prior dispositions
  historical without deleting or rewriting them.

## Platform overrides

Administrators and site moderators may approve, reject, or mark any post in review. Every override
requires a provider-neutral public reason code, may include a staff-only private note, appends a
staff disposition, and sets `platform_override` on the clearance change. Automated decisions do
not replace the latest platform override. A content edit resets the override by creating a new
pending generation.

**On `community_post_reviews`:**

- `unpublished_at`, `unpublished_by_id` — community publication retraction
- `platform_override_*` — controlling platform action; it prevents later community or automated moderation changes

**`community_pinned_posts`:**

- Up to 3 pins per community; `order_index 0–2`. Migration: `backend/data-stores/psql/migrations/0140-00-00-communities-publications.sql`

## Known Gaps

- Reports do not auto-hide content and do not create a report-specific appeals flow. See [REPORTING.md](./REPORTING.md).
- Per-post lock is implemented: migration `0470-00-01-post-locks.sql`, `backend/services/posts/lock.mts`, tested in `playwright/tests/posts/post-lock.spec.mts`.
- Per-post feature and moderator-hide actions are not in schema and remain out of scope.

## Appeals

Members may file an appeal against a post removal via `POST /api/v1/appeals` (target type `removal`). The appeals flow is documented in [MODERATION-APPEALS.md](./MODERATION-APPEALS.md). Post-removal notifications (`createPostRemovedNotification`) are sent fire-and-forget from `updateClearanceStatus` when `status = 'rejected'`.

## Related

- [POSTS.md](../content/POSTS.md) — Post creation, edit, archive, and display rules
- [REPORTING.md](./REPORTING.md) — User report submission flow, rate limits, and admin queue
- [community-moderation.md](./community-moderation.md) — LLM agent prompt moderation for communities
- [Moderation Flows](./MODERATION-FLOWS.md) — end-to-end pipeline: spam detection, OpenAI moderation, LLM agents, community moderation
- [Community Bans](./COMMUNITY-BANS.md), [Community Restrictions](./COMMUNITY-RESTRICTIONS.md), [User Warnings](./USER-WARNINGS.md), [Moderator Notes](./MOD-NOTES.md), [Modmail](./MODMAIL.md), and [Modlog](./MODLOG.md) — newer community moderation subsystems
- [ENTITY-ACTION-MATRIX.md](../ENTITY-ACTION-MATRIX.md) — Cross-cut entity × action reference
- [ENTITY-LIFECYCLE-MATRIX.md](../ENTITY-LIFECYCLE-MATRIX.md) — Entity lifecycle flows and authorization tiers
- [How Moderation Works](../../../articles/how-moderation-works.md) — public-facing overview of the moderation system

**Backend services:**

- `backend/services/posts/delete.mts` — hard delete
- `backend/services/posts/archive.mts` — archive/unarchive
- `backend/services/post-clearance/` — global clearance
- `backend/services/communities/publications/moderate.mts` — community pending approval and unpublish
- `backend/services/communities/publications/pinned.mts` — community pin management
- `backend/services/moderation-reports/` — user report creation

**Migration files:**

- `backend/data-stores/psql/migrations/0075-00-00-entity-history.sql` — `post_revisions`
- `backend/data-stores/psql/migrations/0140-00-00-communities-publications.sql` — `community_post_reviews`, `community_pinned_posts`
- `backend/data-stores/psql/migrations/0270-00-00-post-clearance.sql` — clearance columns and `post_clearance_changes`
- `backend/data-stores/psql/migrations/0330-00-00-moderation-reports.sql` — `moderation_reports`
- `backend/data-stores/psql/migrations/0070-00-00-posts-feed-content.sql` — `agent_moderations`
