# @queues/ban-evasion

Queue system for asynchronous ban-evasion detection on new community members.

## Flow

1. Entity listener fires `enqueueDetectBanEvasion(communityId, userId)` (fire-and-forget) on first post in a community
2. Community join service fires `enqueueDetectBanEvasion(communityId, userId)` (fire-and-forget) on member join
3. Post embedding completion fires `enqueueDetectBanEvasionAfterPostEmbedding(communityId, userId, postId)` when the embedded post is the user's first community post
4. Worker picks up the job and calls `detectBanEvasionForMember(communityId, userId)`
5. Detector runs embedding similarity, content-hash, and referral-link signals in parallel
6. If the combined score exceeds the threshold, flags the `community_members` row and inserts a system moderation report

## Queue

- Queue name: `ban_evasion`
- Job name: `detect`
- Deduplication: debounce per trigger with 60-second TTL. First-post, join, and post-embedding triggers use distinct keys so the embedding-complete pass is not swallowed by the initial first-post pass.

## Retry

- 3 attempts with exponential backoff (5s base delay)
- First-post and post-embedding jobs carry the triggering post ID so candidate-side signal queries inspect only that post. Post-embedding follow-up enqueues are deduped by post and embedding input SHA, then recorded on `posts.ban_evasion_post_embedding_input_sha256` after successful enqueue. Cached embedding copy retries use this marker to rediscover current first community posts whose enqueue failed after the embedding row was updated.

## Enqueue Functions

- `enqueueDetectBanEvasion(communityId, userId)` — first-post detection job
- `enqueueDetectBanEvasionOnJoin(communityId, userId)` — member-join detection job
- `enqueueDetectBanEvasionAfterPostEmbedding(communityId, userId, postId, inputSha256Hex)` — detection after the first post's embedding is available
- `enqueueBulkDetectBanEvasionAfterPostEmbeddings(items)` — batch enqueue for post embedding completions

## Related

- Service logic: [../../services/communities/ban-evasion/](../../services/communities/ban-evasion/)
- Worker: [../../workers/ban-evasion/README.md](../../workers/ban-evasion/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
