# AI Agents

Voucha uses OpenAI for content moderation and fixed classifiers (Jev is the retained classifier fallback), Anthropic or OpenAI
per service setting for focused agents, Amazon Bedrock for semantic search embeddings, and a local Rust detector for
AI-generated post labels. The [AI platform overview](ai-platform.md) owns classifier execution,
provider boundaries and measurement. Native conversation transcript synchronization has its own
[storage contract](conversations.md).

Conversation and message `created_by_id` fields are required API keys but nullable after a user is
hard-deleted. User sidecars omit null IDs, and native conversation lists and transcripts render the
localized `Deleted` fallback for those creators.

## Contents

- <a id="content-moderation-pipeline"></a>[Content Moderation Pipeline](reference-ai-agents-content-moderation-pipeline.md)
- <a id="native-conversations"></a>[Native Conversation Sync](reference-ai-agents-native-conversations.md)
- [Prompt Injection Protection](../../../backend/AGENTS.md)

## Prompt Injection Protection

Sanitize external content before passing it to an agent. Use `sanitizePromptInjection()` and `wrapExternalContent()` from `@jongleberry/vurst-prompt` as described in the [backend rules](../../../backend/AGENTS.md).

## Retention

The usage ledger keeps one row per recorded provider call, including retried calls. Background
response IDs remain in the owning job until recovery or settlement completes.
