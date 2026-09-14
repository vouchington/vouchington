# Moderation Flows reference

[Back to Moderation Flows](MODERATION-FLOWS.md)

## 6. User Reports

**Reportable entities:** `rss_feed_item`, `post`, `comment`, `user`, `url_hostname`

**Reasons:** `spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`,
`other`. `vote_manipulation` is valid only when `entityType = 'post'`.

**Flow:**

1. User clicks Report → `ReportDialog` opens
2. User selects reason (optional note ≤1000 chars)
3. `POST /api/v1/reports` → creates unresolved `moderation_reports` row
4. Debounces a `report_integrity` check for mass-report patterns
5. Admin tooling reads pending rows directly at `/reports`; community owners/moderators review community-scoped post/comment reports in `/communities/:slug/settings/moderation`

**Idempotency:** One unresolved report per reporter and concrete target FK (`post_id`,
`reported_user_id`, `hostname_id`, or `rss_feed_item_id`). Duplicate unresolved reports update the
existing report.

**Rate limits:** 1–20 reports/hour based on trust tier (429 with Retry-After header).

**Database:** `moderation_reports`

**Service:** `backend/services/moderation-reports/`

**Note:** Report resolution is manual-only. Reports never auto-hide content, and Voucha does not provide a report-specific appeals flow.

## 7. Vote Integrity

Suspicious voting patterns are flagged automatically.

**Flag types:** `velocity_spike`, `ip_correlation`

**Resolutions:** `dismissed`, `penalized`, `suspended`

**Admin review at:** `/vote-integrity/flags`

**Service:** `backend/services/vote-integrity/`

Ambiguous report/vote mutations reconcile through authoritative exact reads. The shared
`integrity-authoritative-read` and `integrity-ambiguous-reconciliation` scenarios in
[`lifecycle-scenarios.json`](../../../api-fixtures/v1/lifecycle-scenarios.json) lock the backend,
web, Swift, and .NET outcomes to the same stable case IDs.

## 8. User Suspension

Site admins can suspend users, which hides their content from public feeds.

**API:** `PUT /api/v1/users/:id/suspension` (suspend), `DELETE /api/v1/users/:id/suspension` (unsuspend)

**Admin UI:** `/user/:idOrUsername/admin`

## 9. Domain/Hostname Blocking

Site admins can block hostnames, which:

- Soft-deletes all entity relations to URLs under that hostname
- Applies a 20% vote weight penalty to affected users
- Blocks all subdomains

**Admin UI:** Domain detail page → Moderation tab

See [HOSTNAME-BLOCKING.md](../content/HOSTNAME-BLOCKING.md) for full details.

## Role Matrix

| Action                                  | Regular User | Community Member | Community Mod/Owner | Site Admin |
| --------------------------------------- | ------------ | ---------------- | ------------------- | ---------- |
| Submit report                           | ✓            | ✓                | ✓                   | ✓          |
| View own post moderation status         | -            | -                | -                   | ✓          |
| View community agent moderation results | -            | Plus+ only       | ✓                   | ✓          |
| Approve/reject community queue          | ✗            | ✗                | ✓                   | ✓          |
| Unpublish from community                | ✗            | ✗                | ✓                   | ✓          |
| Manage community agent prompts          | ✗            | ✗                | ✓ (creator)         | ✓          |
| Admin review queue (clearance)          | ✗            | ✗                | ✗                   | ✓          |
| View global user reports                | ✗            | ✗                | ✗                   | ✓          |
| Resolve community-scoped reports        | ✗            | ✗                | ✓                   | ✓          |
| Suspend users                           | ✗            | ✗                | ✗                   | ✓          |
| Block hostnames                         | ✗            | ✗                | ✗                   | ✓          |
| Resolve vote integrity flags            | ✗            | ✗                | ✗                   | ✓          |
| Apply vote-ring penalties               | ✗            | ✗                | ✗                   | ✓          |
| Resolve report integrity flags          | ✗            | ✗                | ✗                   | ✓          |
| Penalize bad-faith reporters            | ✗            | ✗                | ✗                   | ✓          |

## Moderation Claims

**Purpose:** Exclusive advisory claiming for community moderation queue items so two moderators do not concurrently action the same report or post review. Claims are enforced by a partial unique index with a time-based expiry — an active claim is automatically stolen after the TTL elapses.

**Operations:** `claimModerationQueueItem` (claim or steal an expired claim), `releaseModerationQueueItem` (release a claim), `attachReportClaims` / `attachPostClaims` (decorate a list of items with current claim state).

**Database:** `moderation_queue_claims` (`community_id`, `report_id | post_id`, `claimed_by_id`, `claimed_at`, `released_at`)

**Services:** `backend/services/moderation-claims/`

## Moderation Threads

**Purpose:** Internal discussion threads (`channel_type = 'mod_internal'`) for moderators to coordinate on specific community moderation queue items (reports or post reviews). Also supports escalation of queue items to admin attention.

**Operations:** `openModInternalThread` (open a thread linked to a `moderation_report_id` or `post_id`), `escalateModerationQueueItem` (flag a queue item for admin escalation), `deEscalateModerationQueueItem` (reverse an escalation).

**UI behavior:** Discuss creates or finds the queue item's internal thread, then navigates to it in
the current tab. Browser Back returns the moderator to the queue.

**Database:** `conversations` (with `channel_type = 'mod_internal'`), `conversation_participants`

**Services:** `backend/services/moderation-threads/`

## Moderation Exposure

**Purpose:** Tracks how much sensitive media each moderator has been exposed to within a rolling
time window and presents an advisory break when the reveal count exceeds the configured threshold.

**Operations:** `recordMediaReveal` logs a reveal event and returns exposure state from the same
writer transaction. Record-and-state transactions serialize per moderator so concurrent clients
cannot observe independently stale threshold counts. `getExposureState` reads the primary and
returns `count`, `threshold`, `in_cooldown`, and `cooldown_ends_at`.

**Surfaces:** `mod_queue`, `review_queue`, `reports`, `post_page`

Review-queue rows include optional `media_reveal` metadata. Its images are completed, nondeleted,
ordered, and SQL-capped at 20 before aggregation. `requires_reveal` is true exactly when the
current normalized moderation disposition is `review` or `reject` and the row has at least one
such image; it does not expose or depend on a provider-specific moderation result. Web, Swift, and
.NET reveal one post image group immediately and send one durable reveal request. If the response
is lost, the revealed group stays visible while the client marks exposure state stale, blocks
another reveal, and reconciles through the primary GET. On web, unrevealed media descendants remain
inert so focus, keyboard activation, and pointer input cannot bypass the reveal gate, including
while exposure state is stale or in cooldown.
Queue refreshes hydrate exposure alongside the visible rows and discard a GET superseded by a
reveal outcome. At cooldown expiry, clients refetch rather than trusting a local timer. A failed
refresh keeps the soft gate visible with retry; exposure never rejects unrelated moderation
mutations server-side.

**Database:** `moderation_media_reveals`

**Services:** `backend/services/moderation-exposure/`

## Moderation Training

**Purpose:** Records moderator decisions as normalized feedback rows for future agent evaluation and fine-tuning datasets. Captures explicit automod-review labels (`event_type = 'automod_reviewed'`, full confidence) and implicit workflow labels such as queue approvals or report resolutions (lower confidence).

**Labels:** `true_positive`, `false_positive`, `false_negative_candidate`, `true_negative`, `accepted`, `edited`, `rejected`, `not_applicable`

**Source types:** `agent_moderation`, `openai_omni`, `spam_detection`, `community_prompt`, `community_review`, `moderation_report`, `moderation_appeal`, `review_dispute`, `agent_moderation_vote`, `prompt_test_run`

**Database:** `moderation_training_feedbacks`. Each source-specific workflow stores its concrete target foreign key; appeal feedback uses `moderation_appeal_id`, with `post_id` retained only when the appeal itself targets a post.

**Services:** `backend/services/moderation-training/`

## Key Service Files

```
backend/services/post-clearance/     — clearance gate (approve/reject/in_review)
backend/services/spam-detection/     — spam signal checks
backend/services/openai-moderation/  — OpenAI API integration
backend/services/moderation/         — LLM agent moderator management
backend/agents/moderation/           — LLM moderator orchestration
backend/services/moderation-reports/ — user report submission and listing
backend/services/communities/publications/moderate.mts — community mod queue
backend/agents/community-moderation/ — community LLM prompt runner
backend/services/community-agent-prompts/ — community prompt management
backend/services/vote-integrity/     — vote integrity flagging
backend/services/moderation-claims/  — moderation queue exclusive advisory claiming
backend/services/moderation-threads/ — internal mod discussion threads
backend/services/moderation-exposure/ — moderator sensitive-media break tracking
backend/services/moderation-training/ — moderator decision feedback for training
backend/services/ai-usage/           — AI usage cost ledger (recordAiUsage, getCommunityAiCostTotals)
```

## Related Documentation

- [Post Moderation](./POST-MODERATION.md) — roles, authorization matrix, all post moderation actions
- [Reporting & Content Moderation](./REPORTING.md) — user report submission flow and rate limits
- [Community Moderation](./community-moderation.md) — community agent prompts and slot limits
- [Hostname Blocking](../content/HOSTNAME-BLOCKING.md) — domain blocking effects
- [Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md) — cross-cut entity/action reference
- [Entity × Lifecycle Matrix](../ENTITY-LIFECYCLE-MATRIX.md) — entity lifecycle flows
