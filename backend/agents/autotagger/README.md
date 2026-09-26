# Autotagger

Automatically adds "related topic" relations to posts and RSS feed items on creation (not on
update).

## C6 entry points (active)

`run.mts` (`runAutotaggerOnPost`) and `run-rss-feed-item.mts` (`runAutotaggerOnRssFeedItem`) are
the live dispatch paths, called from the `ai-agents` worker processors
(`backend/workers/ai-agents/processors/process-autotagger.mts`). Both resolve embedding-similar
topic candidates, build a sanitized `ClassifierSafeText` state (`content.mts`'s
`buildPostClassifierState` / `buildRssFeedItemClassifierState`), and dispatch through the shared
structured-decision classifier path (`dispatch-classifier.mts`, split into
`dispatch-classifier-execute.mts` and `dispatch-classifier-bindings.mts` to stay under the
per-file line cap). The classifier itself — its active prompt/model/thresholds, and vote
persistence via `applyTopicClassifierDecisionVotes` — lives in `@services/classifiers`, keyed by
the `tagging` prompt slug; the receipt/lease bookkeeping this dispatch claims against lives in
`@services/autotagger` (see [its README](../../services/autotagger/README.md)). Both entry points
write topic votes under the shared `getAutotaggerClassifierSystemUserId()` actor, not the legacy
`autotagger` system user.

No LLM tool-call loop is involved: candidate search, classifier dispatch, and vote application are
plain function calls, not tools an agent invokes. A dispatch error propagates uncaught to the
worker (see `run.mts`'s docstring), which is what turns it into a BullMQ job failure/retry — a
stuck/expired receipt lease is cheap and safe to retry from scratch.

### Rules

- Posts: the classifier's topic cap is tiered by the **post author's** membership plan (admin
  authors are treated as pro-level, since plan resolution has no admin concept) — free authors
  (including authorless posts) get zero topics and the classifier is never dispatched. See
  [Autotagger feature limits](../../../docs/requirements/users/reference-memberships-feature-limits.md#autotagger)
  for the per-tier table.
- RSS feed items: topic enrichment is additive across three independent sources that stack rather
  than replace one another — (1) category→topic mapping (pre-existing, unaffected by tiering),
  (2) a discoverable-source classifier pass, and (3) a no-LLM collaborative-filter pass over paid
  followers (`applyCollaborativeTopicRelations`, capped separately per Plus/Pro follower). See
  [Source Item Anatomy](../../../docs/requirements/anatomy/source-item.md) for the full
  topic-source breakdown. The collaborative pass runs first and unconditionally whenever the
  `enabled` kill-switch is on — regardless of discoverability or whether the classifier pass runs
  or errors — because it derives topics from current follow/vote relations, not from classifier
  output, and is idempotent on every call (a queue retry re-applying it is safe). It includes
  current `active`/`past_due` memberships only, excluding deleted/cancelled/expired/paused
  memberships and elapsed `expires_at` values, matching RSS crawl follower lifecycle semantics.
- All caps above are runtime-configurable through DynamicConfig namespace `autotagger-paid-limits`
  (`getAutotaggerPaidLimitsFields`). The private collaborative caps must remain monotonic: Plus ≤
  Pro.
- Re-dispatching the same (subject, candidate-set, classifier-identity) combination is a no-op:
  the receipt digest (`computeAutotaggerReceiptDigest`) keys the identity, so an unchanged input
  set idempotently replays the prior decision's votes instead of re-calling the classifier.

## C7 residual path (dormant, kept)

`openai-autotagger.mts`, `openai-autotagger-utils.mts`, and `extract-added-topic.mts` implement
the prior free-form-reasoning tool-call loop (the `autotagger` system user driving an OpenRouter
OpenResponses-compatible agent that searches topics and calls an `add_related_topic` tool). They
have no current production caller — C6 fully replaced this dispatch path — and are kept in place
rather than deleted; do not wire them back into a worker without an explicit decision to do so.
`content.mts`'s `createPostAutotagContent` / `createRssFeedItemAutotagContent` (content-hashing
helpers) exist solely to support this residual path; C6 never calls them.

- `add_related_topic` explicitly authorizes the `autotagger` system agent for post and RSS feed
  item category writes; do not grant the agent administrator rights for this workflow.

### Inputs

- Post or RSS Feed Item ID and content

### Tools (C7 only)

- Search topics by semantic text search
- Search topics by full text search
- Automatically add a related topic by post/rss-feed-item id and topic id
