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

## Automod Review Queue

`GET /api/v1/communities/:idOrSlug/moderation-queue` returns entries from three sources
(`queue_source`): `report`, `community_review`, and `automod_flag`. Pass `source=` to narrow to one.
Moderator-tier viewers receive `community_review` and `automod_flag`; member-tier viewers receive
reports only.

An `automod_flag` entry is row-level state on the post's `community_post_reviews` row, not a
separate queue table. It is open while all of these hold:

- `automod_action = 'review_queue'` (an `unpublish` flag records the action already taken and is
  never queued).
- `automod_flagged_content_sha256` equals the post's current `llm_moderation_content_sha256`, so
  editing the post supersedes the flag without any write.
- `automod_dismissed_at` is null.
- The post is approved, not rejected, not unpublished, and not deleted.

A moderator or site staff resolves a flag with
`POST /api/v1/communities/:idOrSlug/posts/:postId/automod-flag/dismissal` (204; idempotent for an
already-dismissed flag; 404 when no flag is current). The dismissal columns
(`automod_dismissed_at`, `automod_dismissed_by_id`) are the audit record. Unpublishing the post
through the existing flow also closes the flag. `record_only` classifications never touch this row.

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
