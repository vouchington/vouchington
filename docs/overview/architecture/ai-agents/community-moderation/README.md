# Community Moderation Agent

Source entrypoint: [backend/agents/community-moderation/README.md](../../../../../backend/agents/community-moderation/README.md)

Runs the community moderation prompt flow for AI-assisted community review.

## Entry Points

- `runCommunityPromptOnPost` - executes the moderation agent for one community prompt job.
- `simulateCommunityPromptOnPosts` - dry-runs a community prompt against posts without writing results.
- `prepareModerationInput` and `callOpenAIModeration` (`openai-moderation.mts`) - build the bounded
  model input and make the OpenAI moderation call. The prompt test-runs route imports them directly.

## Related

- Queue system: [../../queues/ai-agents/README.md](../../queues/ai-agents/README.md)
- Shared agent helpers: [../\_shared/README.md](../../../../../backend/agents/_shared/README.md)
