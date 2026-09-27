# @services/recommended-topics

Source entrypoint: [backend/services/recommended-topics/README.md](../../../../../backend/services/recommended-topics/README.md)

Generates personalized topic recommendations for users based on configurable search options.

## Key exports

- `getRecommendations(currentUserId, options): Promise<RecommendedTopicsResponse>` — returns a list of recommended topics
- `RecommendedTopicsResponse` — `{ results: RecommendedTopicResult[], page_info }`
- `RecommendedTopicResult` — the topic object with a recommendation score
- `RecommendedTopicsOptions` / `RecommendedTopicsSearchOptions` — option types

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- Topics service: [../topics/README.md](../topics/README.md)
