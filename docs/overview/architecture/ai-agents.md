# AI Agents

Voucha uses OpenAI for content moderation, Jev for fixed classifiers, OpenRouter for retained
focused agents, Amazon Bedrock for semantic search embeddings, and a local Rust detector for
AI-generated post labels. The [AI platform overview](ai-platform.md) owns classifier execution,
provider boundaries and measurement. Native conversation transcript synchronization has its own
[storage contract](conversations.md).

Conversation and message `created_by_id` fields are required API keys but nullable after a user is
hard-deleted. User sidecars omit null IDs, and native conversation lists and transcripts render the
localized `Deleted` fallback for those creators.

## Contents

- <a id="systems-overview"></a>[Systems Overview](reference-ai-agents-systems-overview.md)
- <a id="content-moderation-pipeline"></a>[Content Moderation Pipeline](reference-ai-agents-content-moderation-pipeline.md)
- <a id="semantic-search-embeddings"></a>[Semantic Search (Embeddings)](reference-ai-agents-semantic-search-embeddings.md)
- <a id="native-conversations"></a>[Native Conversation Sync](reference-ai-agents-native-conversations.md)
- [Shared Agent Utilities (`@agents/_shared`)](../../../backend/agents/_shared/README.md)
- [Prompt Injection Protection](../../../backend/AGENTS.md)

## Prompt Injection Protection

Sanitize external content before passing it to an agent. Use `sanitizePromptInjection()` and `wrapExternalContent()` from `@jongleberry/vurst-prompt` as described in the [backend rules](../../../backend/AGENTS.md).
