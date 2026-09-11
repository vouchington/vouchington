# @services/moderation-appeals

Service for managing appeals filed by members against moderation decisions (warnings, community
bans, and post removals).

## Overview

A **moderation appeal** allows any signed-in member to formally contest a moderation action taken
against their account or content. Appeals go through a human-in-the-loop review workflow with
AI-assisted drafting, mirroring the review-disputes flow.

## Workflow

1. Appellant files an appeal via `createModerationAppeal` (target: warning, ban, or post removal)
2. AI agent runs `createModerationAppealDraft` to seed `public_response` from `ai_public_response`
3. Moderator edits with `updateModerationAppealDraft`, then approves with `approveModerationAppeal`
4. Moderator sends the approved response via `sendApprovedModerationAppealResolution`
5. Moderator resolves with `resolveModerationAppealAccept`, `resolveModerationAppealReduce`, or
   `dismissModerationAppeal`

## Legally Required Invariant

`sendApprovedModerationAppealResolution` **hard-enforces** that `approved_at IS NOT NULL` before
sending. The AI-drafted response is never delivered directly; a human must approve it first.
Accept, reduce, and deny resolution also require `sent_at IS NOT NULL`, so the final moderation
decision cannot precede delivery of the human-approved response.
AI reruns are accepted only before approval. If approval nevertheless races with an already queued
worker, `createModerationAppealDraft` treats the completed job as stale and leaves the human-approved
response unchanged.

## SLA

`APPEAL_SLA_HOURS = 72`. The `is_overdue` flag is computed in `get.mts` and surfaced to staff.

## Redaction

Non-staff callers must use `redactModerationAppeal` / `listRedactedModerationAppeals` to strip
private fields (appellant identity, appeal reason, AI internals, internal notes).
`public_response` is only visible after `sent_at` is set.

## Data Model

- `moderation_appeals` — one row per appeal
- `moderation_appeal_lifecycle_changes` — append-only audit log of status changes

## Usage Examples

```typescript
// File an appeal
const { appeal } = await createModerationAppeal(currentUser, {
  targetType: 'warning',
  targetId: warningId,
  appealReason: 'I believe this warning was issued in error.',
})

// Get appeal by ID (staff view)
const appeal = await getModerationAppealById(appealId)

// Get appeal list (member view — own appeals only)
const { appeals } = await listModerationAppeals({ appellantUserId: currentUser.id })

// Accept an appeal (lifts the original action)
const resolved = await resolveModerationAppealAccept(staffUserId, appealId)
```
