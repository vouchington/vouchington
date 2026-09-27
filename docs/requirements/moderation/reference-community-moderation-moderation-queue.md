# Community Moderation reference

[Back to Community Moderation](community-moderation.md)

## Moderation Queue

When a post is published or approved in a community:

1. Site-wide post moderation dispatch checks `community_auto_tagger_agents` and runs only the built-in label agents enabled for the post's community
2. `enqueueCommunityPostModeration(postId, communityId)` is called fire-and-forget
3. A dispatcher job fetches all active custom prompts for the community
4. For each unprocessed prompt, an individual job calls the LLM and stores the result
5. Results are deduplicated by `(post_id, prompt_id, sha256(../content))` in `agent_moderations`

This means re-running the queue for the same content is a no-op.

## Slot Reclaim on Moderator Removal

When a moderator is removed from a community, all of their allocated (active) prompts in that community are automatically deactivated:

- `slot_allocated` set to `false`
- `deactivated_at` set to current timestamp

This happens asynchronously (fire-and-forget) after the membership removal.

## Database Tables

- `community_agent_prompts` — prompt definitions with slot and lifecycle state (extension table of `agent_prompts`)
- `community_auto_tagger_agents` — per-community enablement for fixed global label agents
- `agent_moderations` — moderation results are stored in the shared table; community results are identified by joining with `community_agent_prompts`

## Related

- [Web rules](../../../web/AGENTS.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/AGENTS.md) — service, API, and data conventions
- [Moderation Flows](./MODERATION-FLOWS.md) — full end-to-end moderation pipeline including global clearance and site-wide LLM agents

- Service: [docs/overview/architecture/services/community-agent-prompts/README.md](../../overview/architecture/services/community-agent-prompts/README.md)
- Agent runner: `backend/agents/community-moderation/run.mts`
- Queue system: [docs/overview/architecture/queues/ai-agents/README.md](../../overview/architecture/queues/ai-agents/README.md)
- API routes: `backend/api/v1/communities/agent-prompts.mts`, `backend/api/v1/communities/moderation-results.mts`
- OpenAI moderation storage: [docs/overview/architecture/services/openai-moderation/README.md](../../overview/architecture/services/openai-moderation/README.md)
- Slot limits: [memberships.md](../users/memberships.md#refunds-renewal-notifications-admin-grants-feature-flag-and-agent-prompt-slots)
