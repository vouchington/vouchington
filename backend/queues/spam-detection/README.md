# @queues/spam-detection

Queue system for asynchronous spam detection on posts. Part of the post clearance gate.

## Flow

1. Entity listener calls `enqueueSpamDetection(postId, { contentSha256 })` (fire-and-forget) on post create/update
2. Worker picks up the job and calls `processSpamDetection(postId, contentSha256)`
3. Processor fetches the post, computes the moderation content hash, skips stale queued hashes, runs `analyzePostForSpam()`, and stores results via `applyPostSpamDetectionResults()` only if the post still has that content hash
4. If the result applies and the `referral_link_in_post` signal is flagged, applies a vote weight penalty to the author
5. If the result applies, calls `checkPostClearance()` to approve or reject the post based on both spam detection and OpenAI moderation results

## Queue

- Queue name: `spam_detection`
- Job name: `post`
- Concurrency: 5 workers
- Rate limit: 5 jobs/second
- Deduplication: debounce with 60-second TTL per post and moderation content hash, so edits inside the debounce window still get a replacement job

## Retry

- 3 attempts with exponential backoff (5s base delay)
- If embeddings are not yet available, `checkEmbeddingsSimilarity` returns a safe default (not flagged)

## Enqueue Functions

- `enqueueSpamDetection(postId, { contentSha256 })` — fire-and-forget single post enqueue. Passing the moderation content hash makes the job replacement-safe for edited content.

## Related

- [Spam Detection Service](../../services/spam-detection/README.md)
- [Post Clearance Service](../../services/post-clearance/README.md)
