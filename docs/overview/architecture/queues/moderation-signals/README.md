# @queues/moderation-signals

Source entrypoint: [backend/queues/moderation-signals/README.md](../../../../../backend/queues/moderation-signals/README.md)

The `moderation-signals` domain of the shared [`background` queue](../background/README.md): spam
detection on posts and ban-evasion detection on community members. Both are DB-only (no model or
external call), so the domain has **no `limiter` and no group**; the shared worker's concurrency is
the only throttle. Its `workerConcurrency` baseline is 10, the two old workers' 5 each.

## Jobs

| Job (registry name)                 | Attempts | Backoff                      | Priority |
| ----------------------------------- | -------- | ---------------------------- | -------- |
| `moderation-signals.spam_detection` | 1        | none                         | 10       |
| `moderation-signals.ban_evasion`    | 3        | exponential, 5s base, jitter | 10       |

Both keep 100 completed and 100 failed records and debounce with a 60-second TTL. Deduplication ids
stay `spam_detection_<postId>[_<hash>]` and `ban_evasion_...`, which cannot collide with another
domain.

## Spam detection

1. Entity listener, the OpenAI moderation processor, and the story-post agent result call
   `enqueueSpamDetection(postId, { contentSha256 })` (fire-and-forget).
2. The handler calls `processSpamDetection(postId, contentSha256)`: it fetches the post, computes the
   moderation content hash, skips stale queued hashes, runs `analyzePostForSpam()`, and stores the
   results via `applyPostSpamDetectionResults()` only if the post still has that content hash.
3. A flagged `referral_link_in_post` signal applies a vote weight penalty to the author.
4. An applied result calls `checkPostClearance()` to approve or reject the post from both spam
   detection and OpenAI moderation results.

Deduplication is per post and moderation content hash, so edits inside the debounce window still get
a replacement job. If embeddings are not yet available, `checkEmbeddingsSimilarity` returns a safe
default (not flagged).

## Ban evasion

1. The entity listener enqueues `enqueueDetectBanEvasion(communityId, userId, postId)` on a member's
   first community post, and the join service enqueues `enqueueDetectBanEvasionOnJoin`.
2. `enqueueDetectBanEvasionAfterPostEmbedding(communityId, userId, postId, inputSha256Hex)` and its
   bulk form are the enqueue contract after a first post's embedding is available; the input digest
   fences duplicates to the embedding content version. A current production hookup of the single form
   is unconfirmed.
3. The handler calls `detectBanEvasionForMember(communityId, userId, postId)`, which runs embedding
   similarity, content-hash, and referral-link signals in parallel. A score over the threshold flags
   the `community_members` row and inserts a system moderation report.

First-post, join, and post-embedding triggers use distinct deduplication keys so the
embedding-complete pass is not swallowed by the initial first-post pass. Post-embedding enqueues are
recorded on `posts.ban_evasion_post_embedding_input_sha256` after a successful enqueue so cached
embedding copy retries can rediscover first posts whose enqueue failed.

## Related

- [Spam Detection Service](../../services/spam-detection/README.md)
- [Post Clearance Service](../../services/post-clearance/README.md)
- Service logic: [../../services/communities/ban-evasion/](../../../../../backend/services/communities/ban-evasion/)
- Worker: [../workers/moderation-signals/README.md](../workers/moderation-signals/README.md)
