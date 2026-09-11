# @services/topic-claims

Service for managing ownership claims by users representing the real-world entity behind a topic
(e.g. an issuer, brand, or operator).

## Overview

A **topic claim** lets a user assert they represent the entity behind a topic. Once a claim is
verified, the claimant gains standing to dispute reviews of that topic.

## Verification Paths

1. **DNS TXT** – the claimant adds a `_voucha-verification.<hostname>` TXT record.
2. **Well-known file** – the claimant hosts a verification token at `/.well-known/voucha-verification.txt`.
3. **Manual admin** – staff manually verify evidence submitted by the claimant.

DNS record joining and bounded well-known response parsing delegate to
`@vouchington/domain-verification`. This service retains Voucha's verification path, SSRF-pinned
transport, timeout, token hashing, authorization, and claim state transitions.

## State Machine

Claims have no explicit `status` column. State is derived from lifecycle timestamps:

| State    | Condition                                      |
| -------- | ---------------------------------------------- |
| pending  | verified_at IS NULL AND rejected_at IS NULL    |
| verified | verified_at IS NOT NULL AND revoked_at IS NULL |
| rejected | rejected_at IS NOT NULL                        |
| revoked  | revoked_at IS NOT NULL                         |

Use `getTopicClaimState()` to compute the current state from a claim row.

## Exports

- `createTopicClaim` – create or update a live claim (upsert)
- `issueDomainVerificationToken` – generate a token for DNS/well-known verification
- `verifyTopicClaimDomain` – probe DNS TXT or well-known file and mark verified
- `adminVerifyTopicClaim` / `rejectTopicClaim` – staff manual review actions
- `revokeTopicClaim` – staff revocation of a verified claim
- `submitTopicClaimForManualReview` – submit evidence for staff review
- `currentUserCanDisputeReviewsOfTopic` – authorization check for dispute creation
