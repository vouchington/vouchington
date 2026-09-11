# @agents/discovery-agent

Discovery subagent for the chat orchestrator. Surfaces trending topics, trending posts, and personalized recommendations for the current user.
Delegated `query` and `context` inputs are sanitized and wrapped before the inner model call so
conversation text is treated as data, not instructions.

## When to use

The chat orchestrator delegates to this agent when:

- The user asks what is trending or popular
- The user wants to know what is being discussed this week
- The user wants personalized suggestions for what to look into

## Tools (5)

| Tool                     | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `get_trending_topics`    | Top trending topics by time range (day/week/month)      |
| `get_trending_posts`     | Top trending posts by time range and type               |
| `get_recommended_topics` | Personalized topic recommendations for the current user |
| `search_topics`          | Look up topic IDs by name                               |
| `get_topic_details`      | Card attributes to enrich discovery results             |

## Architecture

```
chat orchestrator
    └── run_discovery_agent (max 6 iterations)
            ├── get_trending_topics   → services/trending-topics/get-trending-topics
            ├── get_trending_posts    → services/trending-posts/get-trending-posts
            ├── get_recommended_topics → services/recommended-topics/get-recommendations
            ├── search_topics         → services/topics/search
            └── get_topic_details     → services/topics/cards + services/topics/read
```

## Files

- `build-system-prompt.mts` — `DISCOVERY_SYSTEM_PROMPT` constant
- `tool.mts` — `discoveryAgentTool` created via `createSubagentTool`
- `index.mts` — barrel re-export
- `tool.mock.test.mts` — mock tests (mocks `createOpenAIResponse`)
