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

The classifier itself (its active prompt, model and thresholds, and relation persistence via
`applyTopicClassifierDecisionRelations`) lives in `@services/classifiers`, keyed by the `tagging`
prompt slug; candidate capture, configuration, readiness and effects live in `@services/autotagger`
(see [its README](../../services/autotagger/README.md)). Each applied result becomes a topic
category relation on the post or feed item that was classified, voted under the shared
`getAutotaggerClassifierSystemUserId()` actor, not the legacy `autotagger` system user; it never
writes that actor's global topic election vote.

No LLM tool-call loop is involved in either stage: candidate search, classifier dispatch, and vote
application are plain function calls, not tools an agent invokes. A provider failure is classified once, in the shared
[classifier run executor](../classifier-runs/README.md): a transient one releases the lease and
propagates to the worker for a retry on the minutes-scale `classifier-run` backoff, and a permanent
one ends the run terminal without a retry. Any other dispatch error propagates uncaught to the
worker as a queue job failure; a stuck or expired lease is cheap and safe to retry from scratch.

### C7 scoped reasoning autotagger

C7 is the second stage on the same lifecycle: a scoped reasoning pass for the topics that paying
users follow. It runs only after C6 has completed for the subject's current content, and it is
bounded and add-only. It is not a Jev classifier: a bounded tool-using agent runs on the
[model provider layer](../../backend/modules/model-providers/README.md) (Haiku 5.5 by default, switchable
per service in `ai-model-routing`), and it answers with facts only. `agent-run.mts`
(`executeAutotaggerAgentRun`) runs the leased run; `agent-loop.mts` is the loop, `agent-tools.mts`
its two tools and `agent-instructions.mts` the prompt.

- **The agent:** each turn the model must call a tool. `discover_topics(search)` looks topics up by text
  (marking which hits are candidates); `submit_topics` ends the run with the candidate ids that are
  true of the content, or an empty list. Submitted ids are checked against the run's captured
  candidates, so nothing outside the set can be tagged. There is no probability, threshold,
  negative vote or Jev model on C7's `classifiers` row: the seed inserts the row (primitive
  `agent`) and no prompt version, and the instructions live in code.
- **Bounds:** `agent_max_turns`, `agent_max_tool_calls` and `agent_max_output_tokens` in
  `autotagger-paid-limits` (defaults in `limits-config.mts`). Running out of any of them, or repeating the same calls, ends
  the run with no topics added (a bound is a stop, never a reason to guess); the output-token
  figure is the total across turns and caps each turn at what is left. Tool calls past the bound
  are refused with an instruction to submit.
- **Spend and retries (D3):** the daily spend cap is checked before every turn, and every turn is a
  ledger row attributed to the run. The provider attempt is reserved at the first turn only, after
  the cap admitted it. A run retries only while no turn has billed: a transient failure on the
  first turn releases the lease for a queue retry (within the attempt cap); once any turn has
  billed, any failure (a provider error, a refusal or truncated turn, a breach of the spend cap,
  the deadline) ends the run for good, so a retry can never bill earlier turns again. Persisted
  facts short-circuit replays.
- **Universe and bound:** the candidates are the topics followed by at least one paying user
  (`view_current_paid_memberships`, Plus or Pro; staff, system and deleted accounts and removed
  follows add nothing), minus every topic the subject already has a relation for (live or deleted),
  excluding deleted and merged topics. They are ranked by distance to the subject and cut to
  `AUTOTAGGER_AGENT_MAX_CANDIDATES` (10). It never scans the embedding-miss universe; when nothing
  is left the request settles as no work with no provider call.
- **Gating:** C6's completion transaction writes C7's durable request, so a crash cannot strand it
  and a replayed C6 never schedules it twice. C6's `afterCompleted` then enqueues the C7 dispatcher
  (awaited, so a failed enqueue fails the job for a queue retry), and the sweep recovers any request
  whose enqueue was lost. C6 no-work (kill switch, free-tier author, nothing to ask) or a terminal C6
  failure never completes, so C7 does not run for that content version. A paid follow added later
  affects only later content versions; there is no backfill.
- **Effects:** an accepted topic is applied through the same relation write path as C6 in `addOnly`
  mode, so it only adds relations for topics the subject has no relation row for. It never re-adds,
  removes or overrides what C6 or a person applied, and it never clears or unpublishes content
  (`APPROVAL_CLASSIFIER_SLUGS` excludes it).
- **Identity and spend:** it runs under the `autotagger-agent` classifier slug, billing workload
  and its own system actor (`getAutotaggerAgentSystemUserId()`), apart from C6, and shares C6's
  spend cap and operator kill switch (`getAutotaggerPaidLimitsFields().enabled`). Spend and retry
  guarantees are the lifecycle's: one receipt per subject and content version, persisted outcomes
  short-circuit replays, and a crash between the last turn and persistence can spend again within
  the attempt cap. Its turns are billed per turn, not once per receipt, so the call-efficiency
  report leaves it out of the one-billed-call KPI and reports its turns per run instead.

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
  idempotently replays the prior decision's relations instead of re-calling the classifier. Provider
  spend per run is capped at `maxAttempts` reserved attempts; a crash or lease loss between the
  provider returning and the outcomes being persisted can still spend again, within that cap.
