# Community Moderation Agent

Source entrypoint: [backend/agents/community-moderation/README.md](../../../../../backend/agents/community-moderation/README.md)

Runs the community moderation prompt flow for AI-assisted community review. It is the
`community-moderation` classifier on the shared classifier-run lifecycle: one provider call asks
every active community prompt, and the community's `communities.automod_action` setting
(`record_only`, `review_queue` or `unpublish`) decides what a flag does.

## Entry Points

- `executeCommunityModerationRun` and `createCommunityModerationClient` - build the bounded input
  for a leased classifier run and make the single provider call over every pinned prompt.
- `prepareCommunityPromptDryRun` - loads the active `community-moderation` classifier's prompt,
  model, provider and thresholds once, and returns a `classify` function that asks one stored or
  unsaved community rule one question about a piece of text.
- `simulateCommunityPromptOnPosts` - dry-runs one community rule against up to 50 sampled posts.

## Dry runs

The automod simulate route and the prompt test-runs route are no-persist classifier dry runs. Each
makes one single-question classifier call per post (simulate runs up to eight in flight, each with
its own deadline) and applies the classifier's thresholds, so the preview matches production.
A dry run writes no classifier receipt, attempt or `agent_moderations` row, and it never takes an
automod action. The daily spend cap is checked before any call, and every call records its usage
in the AI usage ledger under the `community-moderation-dry-run` workload.

The simulate response carries one `flagged` verdict per sampled post plus a `simulation` summary
that names the action a real flag would take; the
[simulate reference](../../../../requirements/moderation/reference-post-api-v1-communities-slug-automod-simulate.md)
owns the full shape. The test-runs response is `{ "flagged": boolean }`. Neither carries a `reason`,
because the classifier returns a probability, not an explanation.

## Related

- Queue system: [../../queues/ai-agents/README.md](../../queues/ai-agents/README.md)
- Shared agent helpers: [../\_shared/README.md](../../../../../backend/agents/_shared/README.md)
