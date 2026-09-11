# Wikipedia Recommender System

Dispatches Wikipedia-based topic recommendation batches for recent posts.

## Queue Configuration

### `wikipedia-recommender` (effective concurrency: 1)

- `dispatch` — dispatcher that paginates through recent posts and enqueues `wikipedia-recommender` jobs on the shared `ai_agents` queue (global concurrency: 1)

Recommendation batches execute on `ai_agents`, where OpenAI RPM/TPM limits and agent priorities are centralized.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Wikipedia API module: [../../modules/wikipedia-api/README.md](../../modules/wikipedia-api/README.md)
- Wikipedia topic recommendations service: [../../services/wikipedia-topic-recommendations/README.md](../../services/wikipedia-topic-recommendations/README.md)
- Recommended topics service: [../../services/recommended-topics/README.md](../../services/recommended-topics/README.md)
