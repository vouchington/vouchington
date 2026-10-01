# Community Moderation Agent

Source entrypoint: [backend/agents/community-moderation/README.md](../../../../../backend/agents/community-moderation/README.md)

Runs the community moderation prompt flow for AI-assisted community review. It is the
`community-moderation` classifier on the shared classifier-run lifecycle: one provider call asks
every active community prompt, and the community's `communities.automod_action` setting
(`record_only`, `review_queue` or `unpublish`) decides what a flag does.

## Entry Points

- `executeCommunityModerationRun` and `createCommunityModerationClient` - build the bounded input
  for a leased classifier run and make the single provider call over every pinned prompt.
- `simulateCommunityPromptOnPosts` - dry-runs a community prompt against posts without writing results.
- `prepareModerationInput` and `callOpenAIModeration` (`openai-moderation.mts`) - build the bounded
  model input and make the OpenAI moderation call. The prompt test-runs route imports them directly.

## Related

- Queue system: [../../queues/ai-agents/README.md](../../queues/ai-agents/README.md)
- Shared agent helpers: [../\_shared/README.md](../../../../../backend/agents/_shared/README.md)
