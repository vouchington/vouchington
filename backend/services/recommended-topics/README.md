# @services/recommended-topics

Generates personalized topic recommendations for users based on configurable search options.

## Key exports

- `getRecommendations(currentUserId, options): Promise<RecommendedTopicsResponse>` — returns a list of recommended topics
- `RecommendedTopicsResponse` — `{ results: RecommendedTopicResult[], page_info }`
- `RecommendedTopicResult` — the topic object with a recommendation score
- `RecommendedTopicsOptions` / `RecommendedTopicsSearchOptions` — option types

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Topics service: [../topics/README.md](../topics/README.md)
