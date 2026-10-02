# AI Agents Worker

Source entrypoint: [backend/workers/ai-agents/README.md](../../../../../../backend/workers/ai-agents/README.md)

Worker package for AI agent jobs such as moderation, story clustering, autotagging, and recommendations.
It has no hosted chat processor; native chat is client-generated.

The fixed classifiers (C5 today, C6 next; C8 and C9 later) share one run lifecycle in
[`@services/classifier-runs`](../../../services/classifier-runs/README.md); the worker holds only a
per-classifier registration (`processors/classifier-run-registry.mts`). Approval writes a durable
classifier-run request. `classifier-run-dispatcher` reserves one immutable run for the current
approved content and configuration fingerprint, then awaits its `classifier-run` enqueue; a subject
that is not ready yet leaves its request pending. `classifier-run` re-reads primary state, checks
the run's content and configuration fingerprints, claims a 60-second lease, and bounds
local/provider execution to 55 seconds. Completion applies classifier votes and tags only; it never
writes clearance, review, or publication state.

The five-minute `reconcile-classifier-runs` job has two phases, each a cursor-paginated page that
enqueues the next page as its own stable-id job. The first streams incomplete run identities from
Postgres and re-enqueues those whose stable-id job is gone; only an enqueue that actually adds a
job is counted, and a run whose tenth counted job has vanished is given up (see the
[recovery transitions](../../../services/classifier-runs/README.md#recovery-transitions)). The
second lists each classifier's pending requests, including subjects that never got a run, and
dispatches them. A spend-cap breach (`evaluateOpenAiSpendCapBreach`) ends the sweep before either
phase enqueues anything. The root tick also reads each classifier's receipt health before the
spend-cap check, so a parked backlog is still seen, and the chained pages never read it. It alarms
through `recordClassifierRunAlarm` (`@modules/on-error`, message `classifier_run_alarm`, grouped by
`alarm_kind` and `classifier`) on a stuck run or request, a lost enqueue for an eligible feed item,
a run of terminal failures, a run given up at the sweep bound, a provider client that cannot be
built and a permanent provider rejection (kind `provider-rejected`: a rejected key, exhausted
credits, a malformed request or a guardrail block). A failed health read is reported and never stops
the sweep. The reads and thresholds are described in
[receipt health](../../../services/classifier-runs/README.md#receipt-health).

## Classifier-run backoff

Every other `ai_agents` job keeps `AI_AGENTS_DEFAULTS` (3 attempts, about 3 seconds of exponential
backoff), which cannot ride out a provider outage. A `classifier-run` job is enqueued with its own
options from `@queues/ai-agents/config`:

| Setting                                 | Value                         | Why                                                                      |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `CLASSIFIER_RUN_ATTEMPTS`               | 8                             | Also the receipt's `maxAttempts`, so a retry never reserves a spare one. |
| `CLASSIFIER_RUN_BACKOFF`                | `classifier-run-outage`, 30 s | The worker registers the strategy by this name (`backoffStrategies`).    |
| `CLASSIFIER_RUN_RETRY_AFTER_CEILING_MS` | 10 minutes                    | The longest provider `Retry-After` the backoff will honour.              |

`classifierRunBackoffMs` waits `30 s * 2^(n-1)` before the nth retry, so the seven waits are 30 s,
1 m, 2 m, 4 m, 8 m, 16 m and 32 m: about 63.5 minutes, plus up to 25% jitter. When the failure is a
transient `StructuredDecisionError` that carries a `Retry-After` (a 429, a 503, or the OpenRouter
in-flight budget 402), the wait is the longer of the exponential delay and that header, capped at the
ceiling. A permanent failure never reaches the backoff: the run ends terminal and the job completes.
A classifier-run job still has `AI_AGENT_JOB_PRODUCES_SPEND` false; the structured-decision client's
`beforeAttempt` hook makes the authoritative pre-call spend-cap check on every attempt.

An outage longer than the budget ends the run terminal `provider-error`, so a 403 guardrail block
that carries no `patterns` (a data-policy, ZDR, allowlist or region block looks identical to an
outage) is retried for about an hour before it ends the same way.

## Exports

- `ai_agents` - worker instance for the `ai_agents` queue.

`processReconcileBackgroundResponses` (`processors/process-reconcile-background-responses.mts`) is
the `reconcile-background-responses` job's thin processor: it pages orphaned rows from
`@services/openai-background-responses` and reconciles each with bounded concurrency
(`RECONCILE_CONCURRENCY = 5`). A row is eligible only after its PostgreSQL-clock owner lease
expires; the processor transfers it to a two-minute sweeper lease before any provider call, so a
stale worker cannot race a live owner. All cancel/retrieve/record logic and the durable transition
matrix live in that service package — see
[`@services/openai-background-responses`](../../../services/openai-background-responses/README.md)
and [Background Response Sweeper](../../ai-agents/README.md#background-response-sweeper).

Copyright appeal jobs persist bounded `confirm`, `modify`, `reverse`, or `uncertain` advice using
the immutable appeal receipt and a minimal notice/restriction summary. Their processor has no path
that changes material availability: a moderator must review the stored recommendation and make any
restriction decision separately. The five-minute copyright reconciler re-enqueues an appeal only
while no recommendation exists. It re-enqueues a parsed email intake only while the intake has no
recommendation and no staff decision (an initial review or an admitted or rejected correspondence
review), so an email staff handled while intake was off is never sent to the model afterward.
While `COPYRIGHT_INTAKE_ENABLED` is off, the email-intake and form-screening jobs return without a
model call (the form-screening job also leaves a saved screen unapplied), and the reconciler skips
the `email` and `form-screening` dispatches that start work for new intake. It
still re-enqueues an `appeal` and applies a saved `form-effect`, because both belong to a case
already open. The first pass after the switch is on dispatches every email ingested during the pause and every
form still unscreened.

## Token-limiter wiring (TPM)

`createAIAgentsWorker`'s `tokenLimiter` (`workers/core.mts`) throttles on real per-minute token
consumption, not a decorative ceiling: `processAIAgentWorkerJob` wraps each job's
`processAIAgent(job)` call in `runWithJobTokenAccumulator`
(`backend/agents/_shared/token-accumulator.mts`), an `AsyncLocalStorage`-scoped accumulator.
`recordAgentResponseUsage` (`backend/agents/_shared/record-response-usage.mts`) — the single choke
point every OpenAI call already flows through — feeds it on every call. Once the job settles (success or throw), the summed total is
reported with one `job.reportTokens()` call; `glide-mq` only accepts the last call per job, so
per-call reporting would silently discard everything but the final response's tokens. See
[`@agents/_shared` exports](../../../ai-agents/_shared/reference-exports.md) (`runWithJobTokenAccumulator`)
for the accumulator's throw-safety guarantee.

This wiring is scoped to this worker only. The `openai_moderation_omni_single` worker
(`backend/workers/openai-moderation/`) calls the OpenAI **Moderations** endpoint
(`backend/modules/openai-utils/moderate.mts` → `openai.moderations.create()`), not the Responses
API — that endpoint returns no token usage at all
(`backend/services/openai-moderation/request.mts` hardcodes `tokens: 0`), so there is nothing for
that worker to accumulate or report.

## Daily spend cap

`evaluateOpenAiSpendCapBreach()` (`@services/ai-usage/spend-cap-guard.mts`) is the single decision
point behind the `openai-spend-cap` `DynamicConfig`: it checks `getOpenAiSpendCapFields()` and, if
enabled, the current request-day accounting-uncertainty latch before
`getDailyAiCostTotalMicrounits(day)`, and returns either `null` (proceed) or a breach. Every
call site that can incur billed OpenAI spend goes through it — not just this worker. Synchronous,
non-queue routes that call OpenAI directly (`generateChatTitleFromInput` from
`@agents/conversation-title` in `POST /api/v1/my/conversations/:conversationId/title`, and the moderation call in
`POST /api/v1/communities/:idOrSlug/agent-prompts/:promptId/test-runs`) call the
`assertOpenAiSpendCapNotBreached()` wrapper and reject with 429 on breach; otherwise the cap would
only ever block `ai_agents` queue jobs while these routes kept generating billed spend after the
ceiling was nominally reached.

`processAIAgentWorkerJob` (`workers/core.mts`) calls `evaluateOpenAiSpendCapBreach()` before every
dispatch, ahead of the token-limiter wiring above — but only when `jobProducesOpenAiSpend(job)`
(`workers/core.mts`) says the job actually incurs billed OpenAI generation spend. That helper reads
`AI_AGENT_JOB_PRODUCES_SPEND`
(`@queues/ai-agents/config`), which marks two cases exempt: the four `reconcile-*` job types always
dispatch (they only sweep/cancel/re-enqueue existing work, and in particular
`reconcile-background-responses` cancels orphaned leases that are still billing OpenAI, so blocking
it on the cap would increase spend, not bound it); `auto-dispatch-judgement` is exempt for the same
reason (it only applies an already-computed judgement via DB writes — remove, warn, escalate, or
resolve — and never calls OpenAI itself). A job name that is not in the map, such as a stale
removed `chat` job, is treated as non-spending and reaches the unknown-job failure. (The
shared `checkMessageSafety` moderation pre-check
(`@services/openai-moderation/message-safety`) runs regardless of provider, but the Moderations
endpoint is free and writes no `ai_usage_records` row — see the token-limiter section above — so it
can never affect the cap total.) `OPENAI_RPM`/`OPENAI_TPM`
bound rate, not spend; this bounds the daily dollar total across all spend-producing agents
(`getDailyAiCostTotalMicrounits()`), defaulting to $10/day ($10,000,000 microunits) and adjustable
from the dynamic-config admin UI without a deploy. `getDailyAiCostTotalMicrounits()` also reports
whether any row in the window has `pricing_status = 'unpriced'`; the check fails closed on that (the
summed total is a known undercount) even if the priced total alone is under the cap. On breach —
the cap, an unpriced row, or uncertain accounting after a ledger/latch-read failure — the job calls
`job.moveToDelayed()`, glide-mq's per-job pause
(re-parks only that job into the delayed set, distinct from `handleOpenAIRateLimit`'s worker-wide
`worker.rateLimit()` used for provider 429s) until the queried day's UTC midnight
(`getDayBounds(day).endMs`, `@ts-shared/utils/dates`, using the `day` string
`getDailyAiCostTotalMicrounits()` already queried, not a fresh `new Date()` read — the wall clock
can advance past midnight during the async DB round-trip, in which case the target lands in the
past; glide-mq's promotion function clamps that to `now`, so the job promotes on the scheduler's
next tick instead of erroring) and persists `openAiSpendCapDelayedDay` as exact provenance. It also
registers the exact job ID in a per-day Valkey hash before parking. One generation-deduplicated
coordinator on the separate `openai-spend-cap-rechecks` queue re-runs a persistent breach once per
minute without the `ai_agents` RPM/token limit. When the breach clears, an atomic `releasing` gate
rejects stale admissions, then the coordinator promotes registered delayed jobs in cursor pages of
100, re-checking each job's stored delay day so a midnight re-park onto a newer day's registry
cannot be lifted by an in-flight old-day page.
Registrations already in
flight remain until their jobs actually become delayed. A stale admission rejected by the gate
rechecks the cap once: cleared enforcement receives a one-second retry, while a persistent breach
atomically reopens collection, reserves the job, and parks it at UTC midnight without polling
through the shared OpenAI limiter. This state protocol closes the
register/park/release race without scanning unrelated delayed jobs. If the cap re-breaches during a
partial release, the same generation atomically reopens collection. After an empty release, the
registry is deleted only for that generation; a new registration gets a new coordinator
deduplication ID even if the old coordinator has not returned yet. Raising the numeric cap clears
`cap_exceeded`; an `unpriced_rows` breach instead requires pricing the row, disabling enforcement,
or UTC rollover. At rollover, marked jobs that became waiting, prioritized, or active through their
own midnight delay are removed from the old-day registry instead of keeping its one-second drain loop alive.
Jobs parked by a pre-#9370 worker have no registry entry, retain their original midnight target,
and self-clear at rollover. A registry or coordinator-enqueue failure is reported but cannot
prevent the source job from reaching that same midnight fallback. Coordinator errors retry once
per minute for the registry's full two-day TTL; registered jobs retain their midnight target
throughout. During a rolling deploy, old workers cannot consume the new
coordinator job because it is on a separately selected queue; jobs wait durably until a new worker
revision is present. The worker records an alert via
`recordOpenAiSpendCapBreach`
(`@modules/on-error`) tagged with
`breach_reason: 'cap_exceeded' | 'unpriced_rows' | 'accounting_uncertain'` and the uncertainty
source when applicable. Setting
`enabled: false` disables the check entirely and permits unlimited spend -- it is an opt-out, not a
kill switch. `daily_cap_microunits: 0` is the true zero-spend kill switch instead: the daily total
is never negative, so a 0 cap breaches on the very first dispatch of the day and every subsequent
one, at both the queue and the two route call sites above. `getDailyAiCostTotalMicrounits()` caches
its result
in-process for 60s and per-replica (not shared across the worker fleet via Valkey), so the real
overshoot bound is not just a flat 60s detection lag: every job this worker's `concurrency`
(`getWorkerConcurrency('aiAgents', { baseline: 5 })`) processes concurrently within one cache window
can read the same stale below-cap snapshot and dispatch before the next query refreshes it, and each
other worker replica runs its own independent 60s window on top of that -- so the worst-case
overshoot in a window scales with (per-replica concurrency × per-job spend × replica count), not a
single job's cost. The rare releasing-registry rejection path bypasses a resolved cache entry and
coalesces concurrent refreshes before choosing between one prompt retry and the midnight fallback.
Acceptable at the current pre-launch scale and worker-fleet size; the tradeoff and the production
forecast this closes the gap on are documented in the private `vouchington/vouchington-docs`
repository. See [`@services/ai-usage`](../../../services/ai-usage/README.md#functions) for the
underlying query.

## Performance

- RSS feed item autotagging's collaborative-follower pass (`selectPaidFollowerTopics` in `backend/services/rss-feed-items/collaborative-topic-relations.mts`) runs two queries per item — one for `plus` and one for `pro` plan followers, in parallel — each joining `relation__user__follow__rss_feed` → `view_memberships` → `relation__user__follow__topic` → `topics`. Cost scales with a feed source's paid-follower count, since the join fans out per follower before grouping by topic. Watch this join chain if RSS ingestion throughput regresses as paid followers grow on high-volume feeds.

## Related

- Queue surface: [../../queues/ai-agents/README.md](../../ai-agents/README.md)
- Worker entrypoint: [../../entrypoints/worker-cpu/README.md](../../../backend/entrypoints/worker-cpu/README.md)
- Autotagger agent: [../../agents/autotagger/README.md](../../../ai-agents/autotagger/README.md)
