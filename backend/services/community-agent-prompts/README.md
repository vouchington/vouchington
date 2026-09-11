# community-agent-prompts

Service for managing LLM agent prompts attached to communities. Community owners and moderators create prompts that automatically run against posts published in their community.

## Data Model

**Table: `community_agent_prompts`**

| Column           | Type          | Description                                    |
| ---------------- | ------------- | ---------------------------------------------- |
| `id`             | UUID (UUIDv7) | Primary key; also FK to `agent_prompts.id`     |
| `community_id`   | UUID          | Community this prompt belongs to               |
| `created_by_id`  | UUID          | User who created the prompt                    |
| `slot_allocated` | BOOLEAN       | Whether a user slot is consumed by this prompt |
| `activated_at`   | TIMESTAMPTZ   | When the prompt was activated                  |
| `deactivated_at` | TIMESTAMPTZ   | When the prompt was deactivated                |
| `deleted_at`     | TIMESTAMPTZ   | Soft-delete timestamp                          |
| `deleted_by_id`  | UUID          | Who deleted the prompt                         |

`community_agent_prompts` is an extension table of `agent_prompts`. Prompt text, model configuration, and `agent_id` are stored on the `agent_prompts` row with the same `id`.

A CHECK constraint prevents `activated_at` and `deactivated_at` from both being set simultaneously.

## Slot Enforcement

Slots are **per user across all communities**:

| Plan    | Slots |
| ------- | ----- |
| Plus    | 1     |
| Premium | 3     |
| Pro     | 10    |

- `getUsedSlotsForUser(userId)` — counts rows where `slot_allocated = true AND deleted_at IS NULL`
- `getSlotLimitForMembership(plan)` — returns the limit for the given plan slug
- `SLOT_LIMITS_BY_PLAN` — constant record mapping plan slugs to limits

Slot enforcement is done **atomically** in `allocateCommunityAgentPromptSlot` using a database transaction with `SELECT ... FOR UPDATE` to lock the user's existing prompt rows before counting and updating. This prevents concurrent allocation requests from racing past the limit check.

Archived communities reject prompt creation, edits, slot allocation, and deletions. Prompt creators can still deallocate an already allocated slot after archive so the paid slot is released back to their account.

## Authorization

Defined in `authorization.mts`:

- `currentUserCanManageCommunityPrompts(currentUser, community, membership)` — owner or moderator of the community
- `currentUserCanViewCommunityModerationResults(currentUser, community, membership, activeMembership)` — owner/moderator OR Plus+ community member

Prompt update and deletion take a transaction-scoped PostgreSQL `FOR SHARE` lock on the active
membership row before mutating (administrators retain their existing exception). Every membership
revocation or role update conflicts with that row lock, so a revocation cannot pass between
authorization and the prompt write.

## Files

| File                      | Purpose                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `types.mts`               | `CommunityAgentPrompt` types                                             |
| `authorization.mts`       | `currentUserCan*` authorization functions                                |
| `slots.mts`               | Slot limits, counting, limit lookup                                      |
| `create.mts`              | `createCommunityAgentPrompt`                                             |
| `get.mts`                 | `getCommunityAgentPrompt`, `searchCommunityAgentPrompts`                 |
| `update.mts`              | `updateCommunityAgentPrompt`                                             |
| `delete.mts`              | `deleteCommunityAgentPrompt` (soft-delete)                               |
| `allocate.mts`            | `allocateCommunityAgentPromptSlot`, `deallocateCommunityAgentPromptSlot` |
| `deactivate-for-user.mts` | `deactivateCommunityPromptsForUser` — slot reclaim on moderator removal  |
| `get-active-prompts.mts`  | `getActiveCommunityAgentPrompts` — dispatcher query                      |
| `simulations.mts`         | approved-post sampling and historical false-positive estimate helpers    |
| `index.mts`               | Barrel export                                                            |

## Simulation

`simulations.mts` supports the automod dry-run API. It selects recent approved, non-unpublished
community posts and computes an approximate false-positive estimate from historical flagged results
that remain approved. The LLM call itself stays in `@agents/community-moderation`; this service only
owns sampling and persisted moderation history queries.

## Related

- Queue: [backend/queues/ai-agents/README.md](../../queues/ai-agents/README.md)
- Communities: [../communities/README.md](../communities/README.md)
- Agent: [`backend/agents/community-moderation/run.mts`](../../agents/community-moderation/run.mts)
- Moderation results: [`backend/services/community-agent-prompts/moderations.mts`](moderations.mts)
- API routes: [`backend/api/v1/communities/agent-prompts.mts`](../../api/v1/communities/agent-prompts.mts)
- Full spec: [docs/requirements/moderation/community-moderation.md](../../../docs/requirements/moderation/community-moderation.md)
