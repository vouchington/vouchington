# Moderation Flows reference

[Back to Moderation Flows](MODERATION-FLOWS.md)

## 5. Community Moderation

### 5a. Manual Moderation Queue

When a community has `post_approval_required_at` set, submitted posts enter a pending queue.

**Actions:**

| Action    | Who             | Effect                                                                                       |
| --------- | --------------- | -------------------------------------------------------------------------------------------- |
| Approve   | Owner/moderator | Sets `community_post_reviews.approved_at`; in trusted communities also approves clearance    |
| Reject    | Owner/moderator | Sets `community_post_reviews.rejected_at` with optional reason                               |
| Unpublish | Owner/moderator | Sets `community_post_reviews.unpublished_at`; post survives but removed from community feeds |

**Service:** `backend/services/communities/publications/moderate.mts`

**Pages:** `/communities/:slug/settings/moderation` (pending queue)

### 5b. Community Agent Prompts

Community owners/moderators can create custom LLM prompts. Prompts run on every post published to the community.

**Slot limits (per user, across all communities):**

| Plan    | Slots |
| ------- | ----- |
| Plus    | 1     |
| Premium | 3     |
| Pro     | 10    |

**on_flag_action:** `unpublish` — agent-driven unpublish without human moderator check

Agent-driven unpublish records `community_post_reviews.unpublished_by_id = automod` and writes a `moderator_actions.remove` row.

**API routes:** `GET/POST /api/v1/communities/:slug/agent-prompts`, allocate/deallocate/test sub-routes

**Service:** `backend/agents/community-moderation/run.mts`, `backend/services/community-agent-prompts/`
