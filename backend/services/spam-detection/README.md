# @services/spam-detection

Analyzes posts for spam signals and stores results on the `posts` table. Used by the post clearance gate system.

## Overview

Spam detection runs asynchronously after a post is created or its content changes. Results are stored on the `posts` table and feed into `checkPostClearance()` to determine whether the post should be approved or rejected. Result writes are guarded by the post's current `llm_moderation_content_sha256` so stale jobs cannot apply to edited content.

When a content change resets post clearance or spam/OpenAI moderation fields, the reset caller must
complete the durable queue handoff for replacement moderation jobs or restore the previous
clearance/moderation state on enqueue failure. This keeps the clearance gate from being stranded in
`pending` with no follow-up spam-detection job.

## Signal Detectors

Each signal detector returns a `SpamSignalResult` with a `score` (0–1), `flagged` boolean, and optional `details`.

| Signal                   | Weight | Description                                                          |
| ------------------------ | ------ | -------------------------------------------------------------------- |
| `excessive_links`        | 0.20   | >5 external links, or link-to-word ratio >0.3                        |
| `spam_keywords`          | 0.30   | Matches known spam keyword patterns (crypto scams, SEO spam, pharma) |
| `content_hash_duplicate` | 0.25   | Same content SHA256 exists from a different user                     |
| `low_quality_text`       | 0.10   | Excessive caps, repetitive words, or very short content with links   |
| `embeddings_similarity`  | 0.15   | >99% cosine similarity with another user's post (best-effort)        |
| `referral_link_in_post`  | 0.20   | URLs in post markdown match referral link validation rules           |

## Composite Scoring

Composite score is the weighted sum of all signal scores. If `composite_score >= 0.6` (configurable via `SPAM_SCORE_THRESHOLD`), the post is flagged.

## Key Functions

- `analyzePostForSpam(post)` — runs all signal detectors and returns a `SpamDetectionResult`
- `applyPostSpamDetectionResults(postId, inputSha256, result)` — conditionally writes results to the `posts` table and returns whether the current content hash matched. Callers must compute `inputSha256` from the same primary-read post snapshot they analyzed; a mismatched hash intentionally no-ops.
- `penalizeReferralLinkInPost(userId, postId)` — applies a vote weight penalty for embedding referral links in a post
- Individual signal functions: `checkExcessiveLinks`, `checkSpamKeywords`, `checkContentHashDuplicate`, `checkLowQualityText`, `checkEmbeddingsSimilarity`, `checkReferralLinkInPost`

## Vote Penalty

When the `referral_link_in_post` signal is flagged, a vote weight penalty (0.2 multiplier) is applied to the post author via `penalizeReferralLinkInPost()`. The penalty is idempotent per post (one penalty per offending post, even if re-analyzed).

## Configuration

All thresholds and keyword patterns are in `config.mts` and can be tuned without code changes to the detection logic.

## Related

- [Spam Detection System](../../queues/spam-detection/README.md)
- [Post Clearance Service](../post-clearance/README.md)
- [Vote Weight Service](../vote-weight/README.md)
