# Wikipedia Recommender Agent

LLM agent that scans post content and proposes new topics backed by Wikipedia references.

## Flow

1. read candidate post content
2. search Wikipedia and inspect summaries
3. call `create_topic_recommendation`
4. persist the result as a `topic_recommendation` post for the logged-in recommendation queue

## Notes

- the agent uses the `create_topic_recommendation` tool
- the tool adapts Wikipedia output into the generic topic recommendation post model
- recommendations created by this agent are not exposed through generic `/api/posts` or generic search tools

## Related

- Tool: [../../tools/create-wikipedia-topic-recommendation.mts](../../tools/create-wikipedia-topic-recommendation.mts)
- Service: [../../services/wikipedia-topic-recommendations/README.md](../../services/wikipedia-topic-recommendations/README.md)
