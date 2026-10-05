# Moderation Flows reference

[Back to Moderation Flows](MODERATION-FLOWS.md)

## 4. LLM Agent Moderation

**Trigger:** Post clearance approved (enqueues `classifier-run-dispatcher`). Community prompts are
the `community-moderation` classifier on the same lifecycle: a publication change writes a
`classifier_run_requests` row and enqueues `classifier-run-dispatcher` after commit.

**Baseline vs community-opt-in moderators:**

Moderators with `is_baseline = true` run on every post site-wide, regardless of community membership or community moderation opt-in. Community-opt-in moderators run only when the post belongs to a community that has opted into moderation. Admins can disable any baseline moderator via `moderator_agents.active = false` (kill-switch).

**Active moderators (`backend/services/agents/moderator-configs.mts`):**

| Slug              | Baseline | Detects                                     |
| ----------------- | -------- | ------------------------------------------- |
| `self-promotion`  | no       | Own product/service/referral link promotion |
| `marketplace`     | no       | Buy/sell/trade/hire content                 |
| `ai-generated`    | yes      | AI-generated content (local Rust detector)  |
| `politics-averse` | no       | Partisan political content                  |
| `click-bait`      | no       | Intentionally misleading post               |
| `vague-post`      | no       | Too vague to be useful                      |
| `shit-post`       | no       | Low-effort noise                            |

The config carries only each moderator's identity and baseline flag; the rule text lives in the
post classifier catalog (`backend/types/entities/post-classifier.mts`). The seed provisions the
system user, `agents` row, and `moderator_agents` row per slug, and no `agent_prompts` rows: the
classifier's prompt, model, and provider are seeded with the post classifier. Every seeded
moderator is record-only and has no per-agent action setting; only a community's own prompts can
act on a flag, through the community-level `communities.automod_action` setting.

**Processing (community prompts, `backend/agents/community-moderation/classifier-run.mts`):**

1. Pins the community's active prompts and the content SHA256 on the reserved run; a completed run
   is replayed rather than re-applied
2. Makes one provider call that asks every pinned prompt (at most 30 questions and 40,000 rule
   characters)
3. Stores per-prompt results in `agent_moderations`
4. On flag, applies `communities.automod_action`: `record_only` (default) does nothing more,
   `review_queue` flags the review for moderators, and `unpublish` unpublishes the post as automod
   unless `platform_override_at` is set
5. Records the billed token usage and cost to `ai_usage_records` for any service tier. A ledger
   write failure latches that UTC day's accounting as uncertain, and while the daily AI spend cap is
   enabled the latch rejects further AI calls for the day

The fixed-label built-in agents apply through the post classifier
(`backend/agents/post-classifier/`), which records durable receipts and applies topic relations and
relation votes after clearance approval.

Automated review-queue moves are attributed to `automod` in `post_clearance_changes`. They do not create modlog rows because `in_review` is a triage state, not a terminal action.

**AI cost tracking:** Token usage and estimated cost for each community moderation provider call
(the seeded classifier's OpenRouter transport) are recorded in `ai_usage_records` per community, and
each call is admitted under the daily AI spend cap first. The local `ai-generated`
detector makes no provider call and records no usage. The prompt test and automod simulate dry
runs record theirs under the `community-moderation-dry-run` workload. Administrators can view
per-community cost totals at `/admin/ai-costs` (GET `/api/v1/admin/ai-costs`). The response represents each unbounded scale-six
`total_cost.amount` as a canonical integer string so same-community sums remain exact beyond the
JSON-safe range.

**Database:** `moderator_agents` (`is_baseline`), `agent_moderations`, `agent_prompts` (community prompts only), `ai_usage_records`

**Services:** `backend/agents/community-moderation/`, `backend/services/moderation/`, `backend/services/ai-usage/`
