# Autotagger

Source entrypoint: [backend/agents/autotagger/README.md](../../../../../backend/agents/autotagger/README.md)

Automatically adds "related topic" relations to posts and RSS feed items on creation (not on
update).

## C6 entry points (active)

C6 runs on the shared [classifier-run lifecycle](../classifier-runs/README.md). The `ai-agents`
worker's classifier-run handler leases a run, and `classifier-run.mts` (`executeAutotaggerRun`)
hands the subject's content to the shared executor (`@agents/classifier-runs`). This package
supplies only input building:

- `classifier-run-input.mts` (`buildAutotaggerRunInput`) renders one yes/no question per topic the
  run captured when its receipt was reserved, over the sanitized `ClassifierSafeText` state
  (`content.mts`'s `buildPostClassifierState` / `buildRssFeedItemClassifierState`). It never
  searches for candidates, so a retry, lease reclaim or replay asks the same question set. When
  every captured topic has since been hard-deleted it returns no input: the run has no remote work
  and completes without a provider call or votes. `classifier-run-bindings.mts`
  (`buildAutotaggerBindings`) is the one place a question is rendered, shared with the credentialed
  golden regression set so it asks what production asks.
- `classifier-run-client.mts` (`createAutotaggerClient`) builds the structured-decision client with
  the shared billing hooks; the lifecycle's durable attempt reservation runs in its `beforeAttempt`
  hook. A client that cannot be built ends as the shared `client-unavailable` terminal path.
- `classifier-run.mts` verifies the subject is still at the content the receipt is keyed on
  (posts by the moderation content hash, feed items by the embedding content hash) and returns
  `stale` otherwise.

The classifier itself (its active prompt, model and thresholds, and vote persistence via
`applyTopicClassifierDecisionVotes`) lives in `@services/classifiers`, keyed by the `tagging`
prompt slug; candidate capture, configuration, readiness and effects live in `@services/autotagger`
(see [its README](../../services/autotagger/README.md)). Topic votes are written under the shared
`getAutotaggerClassifierSystemUserId()` actor, not the legacy `autotagger` system user.

No LLM tool-call loop is involved: candidate search, classifier dispatch, and vote application are
plain function calls, not tools an agent invokes. A dispatch error propagates uncaught to the
worker, which turns it into a queue job failure and retry; a stuck or expired lease is cheap and
safe to retry from scratch.

### Triggers

- **Posts:** approval writes a durable `classifier_run_requests` row for C6 next to C5's, in the
  approval transaction (`APPROVAL_CLASSIFIER_SLUGS`). A post approved at creation writes it from
  `processPostCreated`. The dispatcher does not run a model call before the post embedding exists;
  the sweep covers the wait.
- **RSS feed items:** the upsert transaction writes the request (there is no approval gate), and
  the feed item's own eligibility is the embedding wait. The sweep dispatches it.
- The old inline dispatch from `runAutotaggerOnPost` / `runAutotaggerOnRssFeedItem`, the
  `autotagger-post` job and the `autotagger` flow (`backend/flows`) are gone. The slim
  `autotagger-rss-feed-item` job remains and only runs the collaborative-follower pass; it makes no
  model call.

### Rules

- Posts: the classifier's topic cap is tiered by the **post author's** membership plan (admin
  authors are treated as pro-level, since plan resolution has no admin concept) — free authors
  (including authorless posts) get zero topics, and the request settles as no work. See
  [Autotagger feature limits](../../../../requirements/users/reference-memberships-feature-limits.md#autotagger)
  for the per-tier table.
- RSS feed items: topic enrichment is additive across three independent sources that stack rather
  than replace one another — (1) category→topic mapping (pre-existing, unaffected by tiering),
  (2) a discoverable-source classifier pass, and (3) a no-LLM collaborative-filter pass over paid
  followers (`applyCollaborativeTopicRelations`, capped separately per Plus/Pro follower). See
  [Source Item Anatomy](../../../../requirements/anatomy/source-item.md) for the full
  topic-source breakdown. The collaborative pass is its own job that runs whenever the `enabled`
  kill-switch is on, independent of discoverability or of whether the classifier run completes,
  because it derives topics from current follow/vote relations, not from classifier output, and is
  idempotent on every call (a queue retry re-applying it is safe). It includes current
  `active`/`past_due` memberships only, excluding deleted/cancelled/expired/paused memberships and
  elapsed `expires_at` values, matching RSS crawl follower lifecycle semantics.
- All caps above are runtime-configurable through DynamicConfig namespace `autotagger-paid-limits`
  (`getAutotaggerPaidLimitsFields`). The private collaborative caps must remain monotonic: Plus ≤
  Pro.
- One receipt per (subject, content version): the receipt identity is
  `(classifier, subject, input hash, configuration hash)`. The candidate topic set is captured with
  the receipt and is not part of that identity, so a changed candidate set cannot mint a second
  receipt. Persisted outcomes short-circuit any replay, so re-dispatching or a lease expiry
  idempotently replays the prior decision's votes instead of re-calling the classifier. Provider
  spend per run is capped at `maxAttempts` reserved attempts; a crash or lease loss between the
  provider returning and the outcomes being persisted can still spend again, within that cap.
