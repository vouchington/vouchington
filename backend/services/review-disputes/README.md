# @services/review-disputes

Service for managing disputes filed by verified topic claimants against reviews of their topic.

## Overview

A **review dispute** allows a verified topic claimant to challenge a review post that rates their
topic. Disputes go through a human-in-the-loop moderation workflow with AI-assisted drafting.
The disputed topic rating is snapshotted into `review_disputes.disputed_rating` when the dispute is
filed, so staff context remains historically accurate if the review rating is later edited or
removed.
An open dispute is uniquely identified by disputant, review post, and rated topic. Multi-topic
reviews therefore keep each topic's evidence and rating snapshot in a separate dispute.

## Workflow

1. Claimant files a dispute via `createReviewDispute` (requires verified topic claim)
2. AI agent runs `createReviewDisputeDraft` to seed `public_response` from `ai_public_response`
3. Moderator edits with `updateReviewDisputeDraft`, then approves with `approveReviewDispute`
4. Moderator sends the approved response via `sendApprovedReviewDisputeResolution`
5. Moderator resolves with `resolveReviewDisputeRemove`, `resolveReviewDisputeAnnotate`, or `dismissReviewDispute`

## Legally Required Invariant

`sendApprovedReviewDisputeResolution` **hard-enforces** that `approved_at IS NOT NULL` before
sending. The AI-drafted response is never delivered directly; a human must approve it first.

## Redaction

Non-staff callers must use `redactReviewDispute` / `listRedactedReviewDisputes` to strip
private fields (claimant identity, claim text, AI internals, internal notes).
`public_response` is only visible after `sent_at` is set.
