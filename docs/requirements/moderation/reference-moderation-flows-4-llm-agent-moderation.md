# Moderation Flows reference

[Back to Moderation Flows](MODERATION-FLOWS.md)

## 4. LLM Agent Moderation

**Trigger:** Post clearance approved (enqueues dispatcher).

**Baseline vs community-opt-in moderators:**

Moderators with `is_baseline = true` run on every post site-wide, regardless of community membership or community moderation opt-in. Community-opt-in moderators run only when the post belongs to a community that has opted into moderation. Admins can disable any baseline moderator via `agents__moderators.active = false` (kill-switch).

**Active moderators (`backend/services/agents/moderator-configs.mts`):**

| Slug              | Baseline | Detects                                     | on_flag_action |
| ----------------- | -------- | ------------------------------------------- | -------------- |
| `self-promotion`  | no       | Own product/service/referral link promotion | `review_queue` |
| `marketplace`     | no       | Buy/sell/trade/hire content                 | `review_queue` |
| `ai-generated`    | yes      | AI-generated content (local Rust detector)  | `review_queue` |
| `politics-averse` | no       | Partisan political content                  | `review_queue` |
| `click-bait`      | no       | Intentionally misleading post               | `none`         |
| `vague-post`      | no       | Too vague to be useful                      | `none`         |
| `shit-post`       | no       | Low-effort noise                            | `none`         |

**Processing (`backend/agents/moderation/run.mts`):**

1. Skips if OpenAI omni already flagged the post
2. Checks content SHA256 for deduplication (existing results reused)
3. Calls OpenAI LLM (or local Rust for ai-generated)
4. Stores result in `agent_moderations`
5. On flag: executes `on_flag_action` by tagging and/or moving to review queue; moderator agents
   do not write public election votes
6. Tags flagged posts with relevant topics
7. Records LLM token usage and cost to `ai_usage_ledger` (fire-and-forget; flex-tier calls only)

Automated review-queue moves are attributed to `automod` in `post_clearance_changes`. They do not create modlog rows because `in_review` is a triage state, not a terminal action.

**AI cost tracking:** Token usage and estimated cost for each OpenAI flex-tier moderation call are
recorded in `ai_usage_ledger` per community. Multi-call paths (politics-averse) and local-model
paths (ai-generated) do not record usage. Administrators can view per-community cost totals at
`/admin/ai-costs` (GET `/api/v1/admin/ai-costs`). The response represents each unbounded scale-six
`total_cost.amount` as a canonical integer string so same-community sums remain exact beyond the
JSON-safe range.

**Database:** `agents__moderators` (`is_baseline`), `agent_moderations`, `agent_prompts`, `ai_usage_records`

**Services:** `backend/agents/moderation/`, `backend/services/moderation/`, `backend/services/ai-usage/`
