# Story Clustering Classifier (C9)

Source entrypoint: [backend/agents/story-clustering/README.md](../../../../../backend/agents/story-clustering/README.md)

Story clustering is a fixed `choice` classifier (`story-clustering-classifier`) that runs on the
shared [classifier-run lifecycle](../../services/classifier-runs/README.md). One run decides, with
one model call, whether a newly embedded RSS feed item belongs to the same real-world event as any of
up to five candidates, or to none of them. It decides membership only: it writes no title, no
published date and no official item.

`@agents/story-clustering` supplies the input builder and the provider client; the candidate search,
the decision-to-membership rules and the post-commit story refresh live in
[`@services/stories`](../../services/stories/README.md).

## One Choice Question

The run asks a single question (`story-clustering`) whose criteria are the candidates plus an unbound
`none` option:

- `story:<uuid>` for an existing story, represented in the prompt by its member nearest to the
  incoming item's embedding;
- `rss_feed_item:<uuid>` for a standalone neighbor;
- `none` for "belongs to none of them". It is never bound to a candidate and never produces a result
  row, so selection infers it from the absence of a qualifying one.

The state holds the incoming article first and every candidate after it. Every reserved candidate is
rendered, with only its structural lines when its representative has since been deleted, because the
persisted decision must cover exactly the candidates the receipt reserved. Feed-supplied text (feed
title, item title, description) is sanitized and wrapped as external content; ids, criterion keys and
timestamps are the only trusted structural lines.

The seeded prompt (`0635-00-05-seed-story-clustering-classifier`) keeps the editorial rules: only the
same specific event, rumors and leaks are not announcements, reviews are not launches, follow-ups can
be the same event, different incidents are separate stories, and prefer `none` when unsure. The model
is `typesafe/jev-1.13` on OpenRouter; the calling system user is `story-clustering-classifier`, and
spend is attributed to the `story-clustering` workload, never to a post.

## Candidate Selection

Candidates are chosen **once**, when the receipt is first reserved, and stored in
`classifier_run_candidates` (`story_id` or `rss_feed_item_id` per row). They are the up to
`STORY_CLUSTER_CANDIDATE_LIMIT` (5) nearest neighbors by cosine distance under `STORY_DISTANCE_THRESHOLD`
(`0.35`) inside the asymmetric time window, collapsed so each distinct story is one candidate. Items
that already belong to stories are candidates, so a new item can join an existing story rather than
always founding a new one. Admin-locked items, items whose every source feed is undiscoverable,
and members of soft-deleted stories are excluded.

The candidate set is not part of the receipt identity. A later embedding search, a retry, a lease
reclaim or a replay reads the stored set and never searches again, so the same content cannot mint a
second receipt or a second model call because the neighbors changed. A run with no candidates (the
item is gone, already in a story, story-locked, from no discoverable source, or has no neighbor) has
no remote work and settles as no work without a provider call.

## Decision And Membership

`selectStoryClusteringOutcome` turns the persisted decision into an outcome and **fails closed**:

- a bound candidate joins only if its own probability is at least the lower threshold stored on its
  result row (seed `0.65`, the prompt version's default at decision time, never a later
  configuration);
- `none`, a low-confidence, missing, malformed or partial answer selects nothing and the item stays
  standalone;
- with at most six criteria and a lower threshold above 0.5, two bound candidates cannot both clear
  it; if an out-of-band decision says otherwise, the highest probability wins, then the smallest
  candidate key.

The effects run inside the transaction that completes the run, with the incoming and chosen items
re-read under row locks (`applyStoryClusteringEffects`):

| Outcome                                                                           | Effect                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`                                                                            | Nothing changes.                                                                                                                                                           |
| Existing story, still live                                                        | The item joins it under the story lifecycle lock; the story post is refreshed in the same transaction.                                                                     |
| Standalone item that is still standalone and unlocked                             | A new story is founded from the pair. Its title is the chosen item's cleaned title, `published_at` is the earlier member's, and `cluster_reason` is a fixed opaque string. |
| Standalone item that has meanwhile joined a story                                 | The incoming item joins that story instead.                                                                                                                                |
| Item left, locked or already clustered; chosen item locked or gone; story deleted | Skipped (`item_unavailable`, `candidate_unavailable`, `story_unavailable`), never a wrong join.                                                                            |

The classifier never writes `official_rss_feed_item_id`, so it can never override `official_locked_at`;
admins set the official item through the stories API. Assignments use
`UPDATE ... WHERE story_id IS NULL AND story_locked_at IS NULL`, and both founding members must land
in a new story or neither does.

After the membership transaction commits, the registration's `afterCompleted` hook
(`completeStoryClusteringRun`) replays the item's story: it refreshes the story post once more and
dispatches cache invalidation, notifications and the summary agent, none of which can run inside the
transaction. It reads the story from the item rather than trusting the run's summary, so it is
idempotent and also repairs a crash between commit and dispatch when the lifecycle replays a
completed run.

## Run Lifecycle And Spend

- **One call per scope per content version.** The receipt identity is
  `(classifier, subject, input SHA-256, configuration SHA-256)`, and the subject is the RSS feed
  item. The input hash is the item's embedding content hash; the configuration hash covers the prompt
  version, model and actor, not the candidates. Retries, lease expiry and replays reuse persisted
  outcomes and never bill twice; unchanged content under unchanged configuration is never
  re-classified.
- **Stale content.** An item that was deleted, or whose content changed after the receipt was keyed,
  returns `stale` without a model call; the newer receipt owns it.
- **Billing.** The provider client is created only for a run that has remote work. Shared billing
  admits the spend, then the lifecycle's attempt reservation runs immediately before the single
  physical request. A missing `OPENROUTER_API_KEY` (or a non-OpenRouter provider) ends the run through
  the shared `client-unavailable` path.

## Dispatch And Recovery

An RSS upsert writes a durable `classifier_run_requests` row with the item's content, independent of
configuration. Embeddings arrive later, so the run is dispatched when the embedding becomes current:

1. **Single-path worker** ([`nova-multimodal-v1-single.mts`](../../../../../backend/workers/bedrock-embeddings/processors/nova-multimodal-v1-single.mts))
   — after the embedding vector is written.
2. **Batch-path save and reusable-copy reconciliation**
   ([`rss-feed-items.mts`](../../../../../backend/services/bedrock-embeddings-batch/entities/rss-feed-items.mts))
   — for each item id updated by a Bedrock batch result or hydrated from the centralized
   embeddings table.

All three call `dispatchStoryClusteringForEmbeddedItems`, a best-effort enqueue of the stable-id
`classifier-run-dispatcher` job (`classifier_run_dispatcher_story-clustering-classifier_<itemId>`).
It is a latency shortcut only: a failed or deduplicated enqueue is reported and never fails the
embedding job that already stored its vector. The `reconcile-classifier-runs` sweep finds any request
with no run whose item is live at the requested content with a current embedding, so a lost enqueue,
a missing configuration or an embedding that arrived late is recovered without a story-specific
trigger or marker.
