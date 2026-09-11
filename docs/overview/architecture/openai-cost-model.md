# OpenAI Cost Model

Canonical reference for what Voucha's agents spend on OpenAI, why, and how the numbers are
tracked. This page exists because a prior cost accounting gap (#8261, #8185, #8155) meant nobody
could tell whether OpenAI spend was reasonable — see [AI Agents](ai-agents.md) for the agent
architecture this prices, and [`@services/ai-usage`](../../../backend/services/ai-usage/README.md)
for the ledger implementation.

## Model policy

`DEFAULT_AGENT_MODEL` (`backend/agents/_shared/models.mts`) is **`gpt-5.4-nano`**, the only model
any agent can currently resolve to. The previous default, `gpt-5-nano-2025-08-07`, was flagged by
OpenAI for shutdown on **2026-12-11** (announced 2026-06-11) — that forced-not-discretionary
deadline is why this migration happened now. `gpt-5.4-nano` was chosen over `gpt-5.6-luna`
because Luna flex pricing is 5× input / 4.8× output more expensive ($0.50/$0.05/$3.00 vs
$0.10/$0.01/$0.625 per 1M tokens), Luna also bills a `cache_write_tokens` dimension `gpt-5.4-nano`
does not have, and every current workload here is a background classifier or draft-writer that
does not need Luna's added capability.

`gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, and `gpt-4o-mini` are **not supported** — no call site can
reach them, so they carry no price rows and are absent from the `agent_models` DB enum and the
`AgentModel` TS union.

## Supported model × tier matrix

Source: <https://platform.openai.com/docs/pricing>, retrieved **2026-07-28** by parsing the tier
tables directly (the page's rendered summary is unreliable for numeric tables — read the tables,
not the prose). USD/1M tokens, short-context column:

| Model          | Tier     | Input | Cached input | Cache writes | Output |
| -------------- | -------- | ----- | ------------ | ------------ | ------ |
| `gpt-5.4-nano` | Standard | $0.20 | $0.02        | —            | $1.25  |
| `gpt-5.4-nano` | Flex     | $0.10 | $0.01        | —            | $0.625 |
| `gpt-5.4-nano` | Batch    | $0.10 | $0.01        | —            | $0.625 |
| `gpt-5.4-nano` | Priority | _n/a_ | _n/a_        | _n/a_        | _n/a_  |

`gpt-5.4-nano` has **no Priority-tier row at all** on OpenAI's own pricing page — not merely
unimplemented here. `SUPPORTED_MODEL_TIERS` in `backend/modules/openai-utils/pricing.mts` encodes
this structurally: it is a typed const with only `default` and `flex` keys under `gpt-5.4-nano`,
so `gpt-5.4-nano:priority` is a **compile error**, not a runtime `console.warn`. Batch pricing
matches flex but batch mode isn't used by any agent today, so it has no entry — add one the same
way if a batch workload ships.

`gpt-5.4-nano` also has **no billable cache-write dimension** — every tier's cache-writes column
is `—`. `OpenAIUsage`/`ai_usage_records` therefore has no `cache_write_tokens` field; a column
that can only ever hold 0 is speculative generality. (For contrast, `gpt-5.6-luna` flex does bill
one, at $0.625/1M.)

### Refresh procedure

When OpenAI updates pricing or ships a new model this repo adopts:

1. Re-read the tier tables at the URL above (not the summary) and update the microunit values in
   `SUPPORTED_MODEL_TIERS`.
2. Update the retrieval date in that file's source comment and in the table above.
3. If the new model bills `cache_write_tokens` (as `gpt-5.6-luna` does), add the column to
   `ai_usage_records` (migration `0490-00-00-ai-usage-ledger.sql`, edited in place — pre-launch,
   never deployed), a price field to `TokenPrices`, and thread the value through
   `calcCostMicrounits`.
4. Re-run `pricing.test.mts`'s determinism suite — it pins exact microunit output per tier and
   will fail loudly on a transcription error.

## Verified: flex tier is honored

Nothing in the repo read the returned `service_tier` before this PR, so there was no evidence
that a requested `service_tier: 'flex'` was actually served rather than silently downgraded to
`default` (which would double every cost figure below). Two credentialed calls confirmed it
(~$0.0002 spent):

- `{ model: 'gpt-5.4-nano', service_tier: 'flex' }` → `service_tier: "flex"`.
- `{ model: 'gpt-5-nano', service_tier: 'flex' }` (today's then-traffic) → also `"flex"`.

Both calls also surfaced that **`response.model` is a dated snapshot, not the bare alias**:
`{ model: 'gpt-5.4-nano' }` returns `model: "gpt-5.4-nano-2026-03-17"`. A pricing lookup keyed on
that string verbatim would never match `SUPPORTED_MODEL_TIERS` (keyed by alias). `pricing.mts`'s
`normalizeModelAlias()` strips a trailing `-YYYY-MM-DD` suffix before the price lookup, while the
**raw snapshot string** is still what `ai_usage_records.model` stores — the exact snapshot is
strictly more informative for an audit trail than the alias, and OpenAI prices uniformly across
snapshots of one alias.

## Per-unit cost estimates

`gpt-5.4-nano` flex, uncached: **$0.10 in / $0.01 cached / $0.625 out** per 1M tokens.

- **One RSS feed item (autotagger):** 3-4 calls typical, 11 max → ~$0.0017 uncached, ~$0.0008
  cached.
- **One post (7 moderators + politics-averse loop + autotagger):** ~12 calls → ~$0.004.
- **One chat turn, no subagents:** up to 6 calls → ~$0.002.
- **One chat turn with research + discovery + profile subagents:** up to 33 calls → ~$0.012.

Relative to the old `gpt-5-nano`, these are roughly 3-4× — `gpt-5-nano` was the cheapest tier
OpenAI ever shipped and nothing that cheap replaced it. A cost increase versus the old model is
unavoidable; the point of this migration is that the number becomes visible via the ledger below,
not that it goes down.

## Production forecast

Per-unit cost alone isn't an assessment — volume is the free variable. The ingestion volume is
bounded by config already in the repo:

- **Dispatch ceiling:** `capacity_budget: 100` feeds per tick
  (`backend/services/rss-feeds/crawl-config.mts`), dispatcher `pattern: '* * * * *'` → ≤100
  feed-fetches/minute = ≤144,000/day. This bounds _fetches_, not spend.
- **Per-feed cadence:** tier SLAs are 5 min / 15 min / 1 h / 2 h / 24 h, and feeds missing from
  `mv_rss_feed_crawl_tiers` default to the slowest (24 h) tier — most feeds are daily, not
  per-minute.
- **Spend tracks new items, not fetches.** A fetch yielding no new item costs $0; the autotagger
  only runs on newly inserted `rss_feed_items`. The driver is
  `feeds × new items/feed/day × ~3-4 calls/item`.

Seed data carries 75 feed URLs; using that as the order of magnitude:

- **75 feeds × 10 items/day** → 750 new items/day → ~$38/mo autotagger, ~$90/mo if all become
  posts.
- **75 feeds × 20 items/day (typical)** → 1,500 new items/day → ~$77/mo autotagger, ~$180/mo if
  all become posts.
- **500 feeds × 20 items/day (growth)** → 10,000 new items/day → ~$510/mo autotagger, ~$1,200/mo
  if all become posts.

**The assessment:** today's shape is tens of dollars/month, and it scales linearly with feed
count with no ceiling in the system. `OPENAI_TPM: 500_000` (`backend/workers/ai-agents/workers/core.mts`)
allows a theoretical ~$2,160/month of input-token spend before anything throttles — a ~28× gap
between "expected ~$77" and "structurally permitted ~$2,160". That gap, not CI or test spend, is
the real finding behind #8261: only ~$1/month of the measured spend is CI-driven (four
credentialed test files; the Playwright chat spec; ~$0.005/run × ~200 runs/month). Scheduled
Harness dispatch is default-off unless `HARNESS_DISPATCH_ENABLED` and the exact per-surface gate are
enabled. When the master and scheduled gates are enabled, the six daily `scheduled-prompts.yml`
cron events can each create one provider session, in addition to independently gated event-driven
repair sessions. Those providers use externally managed subscriptions, so no dollar estimate is
included here until measured billing data is available. Background RSS ingestion in staging
remains the current OpenAI API cost driver.

These figures are **modeled, not measured** — see Recommendations below for the two changes that
would let the next person validate them against OpenAI's own billing.

## Retry budgets

`create-response.mts` sends `maxRetries: 0` to the SDK for every physical request. The caller's
`maxRetries` value is an application-owned budget (default 2) used only for the positively
known-unbilled flex `resource_unavailable` 429. `backend/agents/_shared/retry-policy.mts` makes that
budget explicit per workload because those free capacity failures still affect user latency:

- **Chat (top-level)** — env-tunable `CHAT_OPENAI_MAX_RETRIES`, `maxRetries: 5`. Its own
  operational knob, kept separate from the policy module below.
- **Chat subagents** (`run_research_agent`, `run_discovery_agent`, `run_profile_agent`) —
  `CHAT_SUBAGENT_RETRY_POLICY`, `maxRetries: 5`. Nested inside a chat turn that already budgets
  5; falling back to the default 2 would fail the subagent before the parent turn would
  have.
- **Synchronous request paths** (generate-title, crm-outreach, community-moderation/simulate) —
  `SYNCHRONOUS_REQUEST_RETRY_POLICY`, `maxRetries: 1`. A user is waiting; a slow failure after
  several retries is worse than a fast one.
- **Queued background agents** (autotagger, wikipedia, story-clustering, story-post,
  report-judgement, appeal/dispute-resolution, customer-support, politics-averse,
  research-response) — `QUEUED_BACKGROUND_RETRY_POLICY`, `maxRetries: 2` (the former SDK default,
  now set explicitly as the free-capacity budget). glide-mq also retries the whole job.

### Queue × retry compounding is bounded by accounting certainty

A queued job can still make multiple physical requests when flex capacity is unavailable, but
those retries are the explicit non-billed exception below. An ordinary 429, 5xx, timeout,
connection ambiguity, unrecoverable foreground-stream interruption, or terminal
failed/incomplete/cancelled response that omits usage has no authoritative usage; the attempt
boundary therefore persists `unknown_billed_attempt` for the request day and stops. Chat's
recoverable `previous_response_not_found` error and explicit client cancellation
(`AbortError` / `APIUserAbortError`) do not latch. Create-level deterministic 4xx also do
not latch; other stream errors still latch because the SSE error event has no HTTP status.
Provider `retry-after-ms` / `Retry-After` values on the free flex retry are clamped to 8 seconds.
The spend-cap guard reads that primary latch before the ledger total, so neither an in-process
retry nor a later queue attempt can silently compound potentially billed unrecorded spend while the
cap is enabled.

### Flex 429 "Resource Unavailable" is not billed

`isOpenAIFlexResourceUnavailableError()` (`backend/modules/openai-utils/rate-limit.mts`) is a
named predicate — not a comment — distinguishing the flex/priority-tier 429 OpenAI returns when
no spare capacity exists for that tier right now (`code: "resource_unavailable"`, message
containing "Resource Unavailable") from an ordinary rate-limit or 5xx. This specific 429 is **not
charged** — OpenAI never started processing the request — so retries against it are free. It is the
only error the application-owned attempt loop retries; every ambiguous potentially billed failure
stops after durably latching accounting uncertainty.

## What the ledger covers — and what it doesn't

`ai_usage_records` (migration `0490-00-00-ai-usage-ledger.sql`) is an append-only per-call ledger:

- `community_id` — Nullable — most agents (chat, autotagger, customer-support, ...) run outside
  any community.
- `post_id` — Nullable — set when the call is post-scoped.
- `agent_slug` — Identifies any agent workload, not only a moderator (renamed from
  `moderator_slug`).
- `model` / `service_tier` — The values **OpenAI actually served** (`response.model`,
  `response.service_tier`), not the requested alias/tier — see the Verified section above for why
  that distinction matters.
- `input_tokens` / `cached_input_tokens` / `output_tokens` — `cached_input_tokens` is new —
  previously the cached discount was applied to cost but never persisted, so historical cost
  figures couldn't be reproduced from their own inputs.
- `pricing_status` / `cost_microunits` / `currency_code` — `unpriced` rows have `NULL`
  cost/currency (e.g. a model/tier pair added to a live response before a price row exists);
  `priced` rows always have both.

`recordAiUsage()` (`backend/services/ai-usage/record.mts`) sits behind an awaited record-or-latch
settlement barrier at every Responses-API call site: the shared tool loop
(`run-tool-loop.mts`, `run-tool-loop-streaming.mts`, `run-tool-loop-streaming-final.mts`, which
covers autotagger, chat, and every subagent), plus the direct `createOpenAIResponse` callers that
bypass the loop (appeal-resolution, dispute-resolution, report-judgement, story-clustering,
story-post, community-moderation/simulate, chat/generate-title). A ledger failure is reported, then
must durably set `ai-usage:accounting-uncertain:<request-day>` on the primary-read Dynamic Config
Valkey group before the wrapper can settle. A creator that loses the exact-token claim (`lost-race`)
must likewise see the response-id fence or set that latch before another provider attempt. The next guard for that UTC day returns
`accounting_uncertain` without trusting the SQL total. If the latch write itself fails, the current
execution rejects fail-closed instead of advancing to another model attempt. The latch is monotonic
until the request-day boundary; `enabled: false` remains the explicit operator bypass.

**Not covered: the moderations endpoint** (`moderate.mts`, used by
`agents/moderation/openai-moderation.mts`). It returns no `usage` and no `service_tier` — there is
nothing to price. It stays on the existing `trackAIModerationCall` analytics path; this is
intentional, not a gap.

**Streams interrupted before completion.** #8836 closes this gap for every call that goes through
`createOpenAIResponse()` and leaves it open for chat's `streamOpenAIResponse()` call, by design —
see "Chat stays foreground" via the TTFT numbers below. The two paths fail differently:

`createOpenAIResponse()` — every direct call site (`callRecordingAgentResponseUsage`,
`record-response-usage.mts`) and the plain (non-streaming) tool loop
(`callRecordingToolLoopUsage`, `run-tool-loop/record-usage.mts`) — always creates with
`background: true` internally and drains the response server-side
(`@modules/openai-utils/create-response.mts`). Generation isn't tied to a client connection here, so
"caller disconnects" isn't the failure mode; the two real ones are (a) the internal drain stream
itself failing (a network blip between our server and OpenAI), which `drainBackgroundOpenAIResponse`
handles by calling `cancelOpenAIResponse(responseId)` and surfacing
`OpenAIResponseNotCompletedError` — carrying `usage` the same way it already did for
provider-returned incomplete responses — so the normal recording path still records it; and (b) the
worker process itself dying (crash, OOM-kill, ECS rolling-deploy replacement) before (a)'s in-process
handling can run. (b) is closed by a durable `openai_background_responses` registry (one row per
in-flight background response, held by a PostgreSQL-clock lease). The active drain renews its
three-minute exact-token lease every 60 seconds; an expired row is atomically transferred to a
two-minute sweeper lease before the scheduled `reconcile-background-responses` job calls OpenAI.
Exact-token finalization prevents a stale owner from deleting or recording after transfer. A
separate non-partitioned response-ID map makes ledger recording globally idempotent, because the
UUIDv7-range-partitioned ledger cannot enforce a unique response ID by itself. The sweeper runs
every five minutes, cancels or retrieves terminal state, and records usage. See
[`@services/openai-background-responses`](../../../backend/services/openai-background-responses/README.md)
for the registry, the idempotency guarantee, and the full failure-mode transition matrix. Built as
[#8836](https://github.com/jonathanong/filaments/issues/8836). Two reported loss boundaries remain:
OpenAI may age a response past its `retrieve()` retention window (~10 minutes, see below), and a
PostgreSQL outage can defeat both bounded lease-acquisition attempts plus the later direct ledger
write. In the latter case no registry row exists, so the response itself is not reconcilable after
a process death; however, the awaited accounting-uncertainty latch now prevents more guarded spend
for that request day. The sweeper uses the same latch if its transactional ledger finalization
fails.

`streamOpenAIResponse()` — the call `runToolLoopStreaming()`/`run-tool-loop-streaming-final.mts` use
for chat's actual token-by-token assistant response — always creates in the **foreground**
(`background` omitted). It never registers with `openai_background_responses` (this path's
`registration` is unset by construction, `record-response-usage.mts`), so a client-side SSE abort
mid-stream is exactly the pre-#8836 behavior documented in the paragraphs below: the response is
discarded server-side with no usage anywhere to reconcile, and the streaming catch blocks'
`recordToolLoopFailedUsage()` only records an `OpenAIResponseNotCompletedError` — which a plain
`AbortError`/`APIUserAbortError`/`TimeoutError` never is. **This is a knowingly accepted, still-open
gap for chat**, not an oversight; closing it needs chat to move to background mode via stream
resumption (`retrieve(id, {stream: true, starting_after: n})`) — see Related below for the
follow-up issue once filed.

The paragraphs below (2026-07-30) are the empirical basis for that split: they show why a naive
"capture the response id and reconcile via `retrieve()`" fix doesn't work on a foreground stream —
exactly why chat, staying foreground, still has this gap — and why background mode's TTFT cost is
what forced chat to opt out rather than adopt it uniformly.

Aborting the client connection after the third streamed text delta on an ordinary **foreground**
call (`gpt-5.4-nano`, `service_tier: 'flex'`, `store: true` explicit), then retrieving the same
response id immediately and after 2s/7s/17s of additional waiting, returned
`404 Response ... not found` on every attempt. A control call (no abort) with the same `store: true`
was retrievable immediately with full `usage`, so the 404 is specific to the client-side abort, not
an account-wide storage setting — aborting a foreground stream cancels/discards the response
server-side, with no usage data anywhere in the API to reconcile from after the fact. This is why
the fix had to change which mode `create-response.mts` requests, not just add a reconciliation step
after the fact.

### Background-mode spike (2026-07-30, `gpt-5.4-nano`)

Numbers below are from live-API runs, not modeled, and directly shaped the #8836 implementation —
in particular, the TTFT penalty found here is why `streamOpenAIResponse()` (chat) stays foreground
while `createOpenAIResponse()` (every non-chat agent call) always creates in the background.

- **`background: true` composes with `stream: true` and with `service_tier: 'flex'`.** The SSE
  event sequence is unchanged and `response.service_tier` still reports `"flex"` — no silent
  downgrade to `default`.
- **A background response survives a client-side abort.** Unlike the foreground 404 documented
  above, `retrieve(id)` on a background response keeps resolving after disconnect instead of
  discarding the response server-side.
- **`cancel(id)` does not reliably carry usage synchronously.** A `cancel()` call can return
  `{status: "cancelled", usage: null}` immediately while the underlying response keeps reporting
  `status: "in_progress", usage: null` for several more seconds — up to ~10s observed — before a
  follow-up `retrieve()` returns the terminal state with populated `usage`. An abort handler that
  calls `cancel()` and expects `usage` on that same response cannot be trusted; something has to
  poll or defer to a sweeper. `~10s` is not a ceiling: the #8836 end-to-end verification (a longer,
  ~700-output-token essay prompt on `flex`, aborted ~6s in) needed close to a minute before
  pre-lease reconciler observed a terminal, usage-bearing state. The current design does not infer
  liveness from response age: it uses a three-minute PostgreSQL-clock active lease, renewed every
  60 seconds, and a two-minute sweeper lease after transfer. This accommodates legitimate
  long-running non-chat calls while still making a crashed owner recoverable.
- **Background mode carries a material time-to-first-token penalty.** Foreground streaming: ~380–580ms
  mean TTFT. Background streaming: ~4,830–5,383ms mean TTFT. That's roughly a **4.2–4.8s absolute
  delta, ~8–13× relative**, measured on the real production model (`gpt-5.4-nano`), both on `flex`.
  This is the number that decided the fix's shape: chat's TTFT budget can't absorb a multi-second
  queueing delay, so `streamOpenAIResponse()` stays foreground; every other agent call site has no
  human waiting on token-by-token output and is uniformly background-eligible through
  `createOpenAIResponse()`.

The admin `/admin/ai-costs` page (`getCommunityAiCostTotals`,
`backend/services/ai-usage/totals.mts`) aggregates **per community** via
`INNER JOIN communities c ON c.id = aul.community_id`, which naturally excludes NULL-`community_id`
rows (every non-community agent) from that view — it is a per-community admin tool, not an
all-agents total. A daily all-agents total is exactly what the spend-ceiling recommendation below
needed and now has: `getDailyAiCostTotalMicrounits()` (`@services/ai-usage/daily-total.mts`), added
by [#8773](https://github.com/jonathanong/filaments/issues/8773) — see Recommendations below.

## Recommendations

- **Unblock validation of this forecast.** `GET /v1/organization/costs` returns **403** on the
  current `sk-proj-` API key — it lacks the `api.usage.read` scope. That endpoint is the only way
  to check the modeled figures above against what OpenAI actually billed. Granting the scope is a
  dashboard/API-key permissions change, not a code change — do this before treating any number in
  this doc as an actual rather than a model.
- ~~**Cap the blast radius.**~~ **Shipped.** `OPENAI_RPM`/`OPENAI_TPM` bound rate, not spend, and the
  production forecast above showed a ~~28× gap between expected (~~$77/month) and structurally
  permitted (~$2,160/month) spend with nothing in the system that would notice ingestion volume
  drifting toward that ceiling. [#8773](https://github.com/jonathanong/filaments/issues/8773) added
  a daily all-agents spend ceiling (`openai-spend-cap` `DynamicConfig`, $10/day default, adjustable
  without a deploy) checked in `processAIAgentWorkerJob`
  (`backend/workers/ai-agents/workers/core.mts`) before dispatch, scoped to job types in
  `AI_AGENT_JOB_PRODUCES_SPEND` (`backend/queues/ai-agents/config.mts`) that actually incur billed
  OpenAI generation spend — the `reconcile-*` job types are exempt so they keep running through a
  breach, including the one that cancels orphaned, still-billing background responses. A breach
  defers only the breaching job via `job.moveToDelayed()` (glide-mq's per-job pause, distinct from
  `handleOpenAIRateLimit`'s worker-wide `worker.rateLimit()` used for provider 429s) until the
  queried UTC day's end, marks the payload with that cap-delay day, and registers the exact job ID
  in a per-day Valkey hash. One generation-deduplicated coordinator on the limiter-independent
  `openai-spend-cap-rechecks` queue re-evaluates a persistent breach each minute. On clear, it
  atomically closes registration and promotes matching jobs in cursor pages of 100; accepted
  registrations still moving
  from active to delayed remain pending, while stale admissions rejected by the release gate retry
  after one second. The backlog therefore neither consumes `ai_agents`' queue-wide `OPENAI_RPM`
  allowance nor requires an unbounded delayed-set scan. A numeric raise clears `cap_exceeded`;
  `unpriced_rows` requires pricing the row, disabling enforcement, or UTC rollover. Pre-#9370 jobs
  lack registry entries and self-clear at their original midnight timestamp. The separate queue is
  rolling-deploy safe because old workers cannot consume its job name. Generation-scoped
  deduplication closes the empty-registry/final-return handoff race, re-breach atomically reopens the
  same generation and revokes the active release lease. Each promotion and registry cleanup is
  atomically fenced by that lease, so an old drain cannot promote more work or erase a fresh
  registration after a re-breach. Each scanned release page enters GlideMQ's immediately due
  scheduled set atomically, preserving numeric priority within that release boundary, and re-checks
  the job's stored `openAiSpendCapDelayedDay` so an in-flight old-day page cannot lift a job that
  already re-registered for a newer day's breach. The dedicated coordinator remains
  stream-backed so an idle worker wakes without a priority-list polling delay. Coordinator errors
  retry once per minute for the registry's full two-day TTL. Registered jobs still self-release at
  midnight independently. The worker records an alert via
  `recordOpenAiSpendCapBreach`. The daily
  total (`@services/ai-usage/daily-total.mts`) sums
  `ai_usage_records.cost_microunits` over an id-range against the primary key (via
  `getUtcDayUuidv7Bounds`), not a `created_at` index, per the "query by id, not created_at" rule, and
  also reports whether any row in the window has `pricing_status = 'unpriced'`; the check fails
  closed (defers the job with `reason: 'unpriced_rows'`) when that's true, since an unpriced row
  makes the summed total a known undercount that can't be trusted to compare against the cap. The
  daily total is cached in-process for 60s and **not shared across worker replicas** — each replica
  aggregates and caches independently — so a fleet can collectively overshoot the cap by up to
  `replica_count × up-to-60s` worth of spend before every replica's cache catches up; acceptable at
  the current pre-launch replica count and $10/day conservative default, but worth widening (a
  shared Valkey-cached total, or a shorter TTL) before either scales up materially.
  A registration rejected during a concurrent release is the exception: that worker bypasses its
  resolved entry and coalesces a fresh primary-Postgres read before it chooses a prompt retry or
  atomically reopens collection and reserves the job for the UTC-midnight fallback, so neither a
  stale per-process breach nor a later cap relaxation can strand newly rejected work.

**Physical attempts are application-owned.** `create-response.mts` is the sole
`openai.responses.create()` boundary and disables SDK-internal retries. It rechecks the spend cap
before each known-unbilled flex-capacity retry. Completed and terminal failed/incomplete responses
settle through the usage ledger; an ambiguous potentially billed attempt without usage instead
awaits the generic request-day accounting-uncertainty latch before control can escape. Foreground
streams are never replayed after an interruption, avoiding duplicate visible output and spend.

## Related

- [AI Agents](ai-agents.md) — agent architecture this doc prices
- [`@services/ai-usage`](../../../backend/services/ai-usage/README.md) — ledger implementation
- [`@modules/openai-utils`](../../../backend/modules/openai-utils/README.md) — pricing, retry, and rate-limit helpers
- [Deployment Costs](../infrastructure/deployment-costs.md) — where this fits in overall infra spend
- [#8261](https://github.com/jonathanong/filaments/issues/8261) — "usage seems too high" (closed by this migration)
- [#8185](https://github.com/jonathanong/filaments/issues/8185) — cost accounting traceability (closed by this migration)
- [#8155](https://github.com/jonathanong/filaments/issues/8155) — retry budget visibility (closed by this migration)
- [#8186](https://github.com/jonathanong/filaments/issues/8186) — eval harness before migrating (closed; this migration shipped on published pricing without it, and this ledger supplies the cost half of any future harness comparison)
- [#8773](https://github.com/jonathanong/filaments/issues/8773) — daily spend ceiling (shipped, see Recommendations above)
- [#9443](https://github.com/jonathanong/filaments/issues/9443) — application-owned physical attempts and fail-closed retry accounting (shipped above)
- [#8888](https://github.com/jonathanong/filaments/issues/8888) — resume SSE stream instead of restarting (closed won't-do; background mode's 4.2–4.8s TTFT penalty, measured above, is why)
