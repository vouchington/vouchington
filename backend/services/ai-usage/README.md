# @services/ai-usage

Records and aggregates OpenAI token usage and cost across **every** agent call site, not only
per-community moderation. The full pricing matrix, the production forecast, and the statement of
what this ledger does and doesn't cover live in the private `vouchington/vouchington-docs`
repository.

## Data Model

`ai_usage_records` — append-only ledger, one row per Responses-API call. `community_id` and
`post_id` are both nullable: most agents (chat, autotagger, customer-support, research, ...) run
outside any community or post. `agent_slug` identifies any agent workload, not only a moderator.
`model` and `service_tier` record what OpenAI **actually served** (`response.model`,
`response.service_tier`), not the requested alias/tier — see the cost-model doc's "Verified: flex
tier is honored" section for why that distinction matters.

`ai_usage_openai_response_keys` maps each OpenAI Responses API `response_id` to exactly one
ledger row. It remains non-partitioned because the UUIDv7-range-partitioned ledger cannot enforce
global uniqueness for a key that does not include its partition key. A response ID is reserved and
its ledger row inserted in one SQL statement; a replay returns `already-recorded` without adding a
second row.

**Not covered:** the moderations endpoint (`moderate.mts`) returns no `usage`/`service_tier` and
stays on the existing `trackAIModerationCall` analytics path — by design, not a gap.

## Functions

- `recordAiUsage(options: RecordAiUsageOptions)` — inserts a cost record from
  `{ responseId?, communityId?, postId?, agentSlug, model, serviceTier, usage }` and returns
  `recorded` or `already-recorded`. Computes
  `cost_microunits`/`pricing_status` via `calcCostMicrounits` (`@modules/openai-utils`) and
  persists `cached_input_tokens` so historical cost figures are reproducible from their own
  inputs. Every shared tool-loop and direct `createOpenAIResponse` caller awaits a record-or-latch
  settlement barrier: a successful ledger write proceeds normally, while a failed write must
  durably set that request day's accounting-uncertainty latch before the caller can continue.
  Losing the background-response lease (`lost-race`) is also unsettled until
  `hasRecordedAiUsageResponseId` finds the response-id fence or the caller sets that latch.
  See the cost-model doc for the full call-site list.
- `getCommunityAiCostTotals()` — aggregates total tokens and cost **per community**, ordered by
  cost descending. Its `JOIN communities` naturally excludes NULL-`community_id` rows (every
  non-community agent) — this is a per-community admin view, not an all-agents total. PostgreSQL
  compares the exact numeric sum for cursor pagination and returns `total_cost.amount` as a
  canonical scale-six integer string, preserving totals beyond the JSON-safe range. Used by the
  admin AI Costs page.
- `currentUserCanViewAiCosts(currentUser)` — authorization guard; returns true only for administrators.
- `getDailyAiCostTotalMicrounits()` — sums `cost_microunits` across **every** agent (no
  `communities` join, so NULL-`community_id` rows are included) for the current UTC day. Unlike
  `getCommunityAiCostTotals()`, this is time-windowed, not all-time. The window is an `id`-range
  against the primary key (`getUtcDayUuidv7Bounds`), not a `created_at` index — there isn't one.
  In-process-cached for 60s. `refreshDailyAiCostTotalMicrounits()` bypasses a resolved cache entry
  while coalescing concurrent primary-Postgres refreshes for release-race decisions. Backs the
  daily spend-ceiling check in the `ai_agents` worker; see
  [Daily spend cap](../../workers/ai-agents/README.md#daily-spend-cap).
- `getOpenAiSpendCapFields()` — reads the `openai-spend-cap` `DynamicConfig`
  (`spend-cap-config.mts`): `{ enabled, daily_cap_microunits }`, defaulting to
  `{ enabled: true, daily_cap_microunits: 10_000_000 }` ($10/day). Valkey-backed and adjustable
  from the dynamic-config admin UI without a deploy. `evaluateOpenAiSpendCapBreach` restarts when
  the UTC day changes during its async reads so an admission decision never uses yesterday's latch
  or ledger total.
- `registerOpenAiSpendCapDelayedJob()` / `beginOpenAiSpendCapDelayedJobRelease()` /
  `releaseOpenAiSpendCapDelayedJobs()` — maintain the per-UTC-day worker-queue Valkey registry used
  for early cap relaxation. Lua scripts atomically reject registration after release begins,
  atomically reopen and reserve a rejected job after a fresh re-breach, promote only jobs whose
  stored delay day still matches the draining registry, and delete only that
  generation after its cursor-paged drain is empty. An accepted job is marked before it parks;
  registrations still transitioning
  from active to delayed remain pending before the day boundary, while same-day marked jobs already
  waiting, prioritized, or active after rollover are removed as naturally released. A successor
  generation gets a distinct coordinator deduplication ID, closing the final-return handoff race. Registration
  failures are reported and retain the source job's midnight fallback rather than consuming its
  ordinary processing attempts.
- `latchAccountingUncertainty({ requestDay, source })` / `getAccountingUncertaintySource(requestDay)` —
  set and read the primary-Valkey, per-UTC-day fail-closed latch used when billed OpenAI usage may
  be missing from the ledger. The first source (`ledger_write_failed` or `unknown_billed_attempt`)
  remains diagnostic state until the request day's boundary; past-day writes are no-ops. The
  physical Responses API attempt hooks write `unknown_billed_attempt` before an ambiguous create
  or foreground-stream error can escape; known-unbilled flex capacity failures do not set it.
