# Story Clustering Agent

The `story-clustering-classifier` (seeded by `0730-00-02-seed-story-clustering-classifier.mts`) is a
Choice classifier that decides whether an incoming RSS feed item belongs to an existing story, forms
a new story with one standalone candidate, or stands alone. One structured-decision call per
clustering job — no freeform LLM title/`published_at`/official-item generation; those are either
derived deterministically or left to admins.

## Why a Choice Classifier, Not an Agent

The former `@story-teller` agent made one freeform LLM call per item that decided clustering _and_
authored a title _and_ picked `published_at` _and_ selected the official item, all from unstructured
model output. The Choice classifier narrows the model's job to exactly one decision — "which of these
≤5 candidates (or none) does this item belong with?" — using the same reusable Choice-classifier
machinery as the autotagger (`@agents/classifiers/execute-single-call`, `@modules/structured-decisions`,
`@services/classifiers`). Everything else the old agent free-formed is now either derived
deterministically in code (`story-metadata.mts`) or removed (official-item selection is admin-only;
see [`backend/services/stories/README.md`](../../services/stories/README.md)).

## Candidate Selection

Candidates are the up to `STORY_CLUSTER_CANDIDATE_LIMIT` (5) nearest neighbors by cosine distance,
within the asymmetric time window (`@services/stories/cluster-candidates.mts`). Candidates include
items that already belong to stories **and** standalone items — the classifier's Choice criteria are
one row per candidate (bound to either its story or, for a standalone item, itself) plus a single
unbound `none` criterion. `dedupeStoryClusterCandidates` (`dedupe-candidates.mts`) collapses candidates
that already share a story before they're sent to the classifier, so the same story is never offered
as more than one criterion.

`STORY_DISTANCE_THRESHOLD` is `0.35` (cosine distance); items at or above that distance never reach
the candidate set, let alone the classifier.

## Dispatch and Replay

`dispatchStoryClusteringDecision` (`choice-clustering.mts`) is the sole entry point, called once per
job by `@services/stories/cluster.mts`:

1. Check for an already-committed decision under the job's `batchId`
   (`readCompleteClassifierDecisionIfExistsFromPrimary`) — if one exists, replay its outcome without
   ever loading candidates or calling the model. This makes a retry after a partial failure (decision
   persisted, caller crashed before acting on it) idempotent.
2. Otherwise, load and dedupe candidates via the caller-supplied `loadCandidates()` thunk (a thunk,
   not a plain array, so a replay never re-runs the candidate search, and so this package never
   depends on `@services/stories` — see the cycle-avoidance note in `choice-clustering.mts`). No
   candidates → outcome is `none` without a model call.
3. Build Choice bindings (`choice-clustering-bindings.mts`) from the incoming item + candidate
   content, dispatch a single `executeSingleCallClassifierDecision` call, and select the outcome from
   the persisted results (`choice-clustering-selection.mts`).

`selectStoryClusteringOutcome` picks the highest-probability row that cleared its own
`effectiveThresholds.lower` (never the classifier's global default, since a per-row override or a
prompt-version rotation can differ from the currently-active configuration). The seed's 0.65
threshold makes it mathematically impossible for two rows to clear at once across ≤6 total criteria
(5 candidates + `none`); the highest-probability-then-key tie-break is defense-in-depth, not a case
this seed can actually hit.

## Outcomes

- `{ kind: 'none' }` — item stays standalone, no action
- `{ kind: 'existing_story', storyId }` — the classifier bound to a candidate that already has a
  story; `assignItemToExistingStory` (`@services/stories/cluster-join.mts`) joins the item to it
- `{ kind: 'standalone', rssFeedItemId }` — the classifier bound to a standalone candidate;
  `createClusteredStoryPair` (`@services/stories/cluster-create-pair.mts`) atomically locks and claims
  **both** items and creates a new story from the pair. New-story creation is pair-only: a single
  decision never merges more than the incoming item and one selected candidate.

## New Story Metadata

`deriveNewStoryMetadata` (`story-metadata.mts`) computes a new story's fields deterministically —
no LLM authorship:

- `title`: `normalizeStoryTitle` of the **selected standalone candidate's own title only** (never the
  incoming item's) — HTML/entity-stripped, whitespace-collapsed, truncated to 500 code points; an
  empty result becomes `undefined` (stored as `NULL`) rather than violating the column's
  `BETWEEN 1 AND 500` check.
- `published_at`: the earlier of the two members' own `published_at` (both always concrete).
- `cluster_reason`: the fixed constant `STORY_CLUSTER_REASON` — every classifier-created story gets
  the same opaque display string; nothing parses `cluster_reason` as anything but display text.

## Files

| File                              | Responsibility                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `index.mts`                       | Re-exports `choice-clustering.mts`, `choice-clustering-selection.mts`, `story-metadata.mts`   |
| `choice-clustering.mts`           | `dispatchStoryClusteringDecision` — replay check, candidate load/dedupe, Choice dispatch      |
| `choice-clustering-bindings.mts`  | Builds the Choice classifier's per-candidate + `none` bindings from item/candidate content    |
| `choice-clustering-selection.mts` | `selectStoryClusteringOutcome` — picks the outcome from a Choice decision's persisted results |
| `dedupe-candidates.mts`           | `dedupeStoryClusterCandidates` — collapses candidates that already share a story              |
| `story-metadata.mts`              | `deriveNewStoryMetadata`, `normalizeStoryTitle`, `STORY_CLUSTER_REASON`                       |

## Trigger Contract

A `story-clustering` job is enqueued whenever an RSS feed item transitions from "no embedding" to
"has embedding", regardless of which path delivered the embedding:

1. **Single-path worker** ([`backend/workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts`](../../workers/bedrock-embeddings/workers/bedrock-embeddings-nova-multimodal-v1-single.mts)) — immediately after `upsertRssFeedItemEmbedding` writes the embedding vector.
2. **Batch-path save** ([`backend/services/bedrock-embeddings-batch/entities/rss-feed-items.mts`](../../services/bedrock-embeddings-batch/entities/rss-feed-items.mts)) — for each item id returned by `applyRssFeedItemBatchUpdates` after a Bedrock batch result is applied.
3. **Batch-path copy-existing** (same file) — for each item hydrated from the centralized `bedrock_nova_multimodal_v1_embeddings` table by `copyExistingRssFeedItemEmbeddings`.

All three paths use the same `debounce` dedup key (`story_clustering_${id}`, 60 s TTL), so rapid
re-enqueues coalesce. Each enqueue mints (or, on the embedding-retry re-enqueue path, preserves) the
job's `batch_id` — see [`backend/queues/ai-agents/README.md`](../../queues/ai-agents/README.md).

## Embedding Retry

`processStoryClustering` mirrors the autotagger's embedding-retry pattern. If `clusterRssFeedItem`
returns `null` and `hasRssFeedItemEmbedding` returns `false`, the processor re-enqueues with
`embedding_retries + 1` and a 5 s delay, up to a cap of 10 retries, preserving the original `batch_id`
so the retried job still replays rather than re-decides once the embedding becomes visible. This
handles narrow timing gaps where clustering fires before the embedding row is fully visible.

## Spend Attribution

Story-clustering dispatch calls are attributed to the `story-clustering`
`ai_usage_records.agent_slug` bucket via `createStructuredDecisionSpendHooks`, distinct from the
`story-clustering-classifier` classifier slug used for configuration/decision lookup.

## Related

- Service: [`backend/services/stories/README.md`](../../services/stories/README.md) — `clusterRssFeedItem` orchestration, race-condition handling, configuration
- System: [`backend/queues/ai-agents/README.md`](../../queues/ai-agents/README.md) — job queue, `batch_id` minting
