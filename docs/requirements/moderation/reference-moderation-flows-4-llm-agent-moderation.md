# Moderation Flows reference

[Back to Moderation Flows](MODERATION-FLOWS.md)

## 4. LLM Agent Moderation

**Trigger:** Post clearance approved (enqueues `post-classifier-dispatcher`). Community prompts run
separately through `community-moderation-dispatcher` and `community-moderation-prompt`.

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

**Processing (community prompts, `backend/agents/community-moderation/run.mts`):**

1. Checks content SHA256 for deduplication (existing results reused)
2. Calls the OpenAI moderation helper (`callOpenAIModeration` in
   `backend/agents/community-moderation/openai-moderation.mts`)
3. Stores result in `agent_moderations`
4. On flag with `on_flag_action = 'unpublish'`: unpublishes the post from the community as the agent
5. Records LLM token usage and cost to `ai_usage_ledger` (fire-and-forget; flex-tier calls only)

The fixed-label built-in agents apply through the post classifier
(`backend/agents/post-classifier/`), which records durable receipts and applies topic votes and
tags after clearance approval.

Automated review-queue moves are attributed to `automod` in `post_clearance_changes`. They do not create modlog rows because `in_review` is a triage state, not a terminal action.

**AI cost tracking:** Token usage and estimated cost for each OpenAI flex-tier moderation call are
recorded in `ai_usage_ledger` per community. Multi-call paths (politics-averse) and local-model
paths (ai-generated) do not record usage. Administrators can view per-community cost totals at
`/admin/ai-costs` (GET `/api/v1/admin/ai-costs`). The response represents each unbounded scale-six
`total_cost.amount` as a canonical integer string so same-community sums remain exact beyond the
JSON-safe range.

**Database:** `agents__moderators` (`is_baseline`), `agent_moderations`, `agent_prompts`, `ai_usage_records`

**Services:** `backend/agents/community-moderation/`, `backend/services/moderation/`, `backend/services/ai-usage/`
