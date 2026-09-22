# AI Agents

Voucha uses OpenAI for content moderation and retained focused backend agents, Amazon Bedrock for
semantic search embeddings, plus a local Rust detector for AI-generated post moderation. Hosted web
agent chat has been removed; native transcript synchronization remains available during migration.

Conversation and message `created_by_id` fields are required API keys but nullable after a user is
hard-deleted. User sidecars omit null IDs, and native conversation lists and transcripts render the
localized `Deleted` fallback for those creators.

## Contents

- <a id="systems-overview"></a>[Systems Overview](reference-ai-agents-systems-overview.md)
- <a id="content-moderation-pipeline"></a>[Content Moderation Pipeline](reference-ai-agents-content-moderation-pipeline.md)
- <a id="semantic-search-embeddings"></a>[Semantic Search (Embeddings)](reference-ai-agents-semantic-search-embeddings.md)
- <a id="llm-agent-conversations"></a>[LLM Agent Conversations](reference-ai-agents-llm-agent-conversations.md)
- [Shared Tool-Call Loop (`@agents/_shared`)](../../../backend/agents/_shared/README.md)
- [Prompt Injection Protection](../../../backend/CLAUDE.md#rules)
