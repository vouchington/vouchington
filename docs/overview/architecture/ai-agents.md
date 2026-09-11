# AI Agents

Voucha uses OpenAI for content moderation and LLM-powered agent conversations, Amazon Bedrock
for semantic search embeddings, plus a local Rust detector for AI-generated post moderation.

Conversation and message `created_by_id` fields are required API keys but nullable after a user is
hard-deleted. User sidecars omit null IDs, and native conversation lists and transcripts render the
localized `Deleted` fallback for those creators.

## Contents

- <a id="systems-overview"></a>[Systems Overview](reference-ai-agents-systems-overview.md)
- <a id="content-moderation-pipeline"></a>[Content Moderation Pipeline](reference-ai-agents-content-moderation-pipeline.md)
- <a id="semantic-search-embeddings"></a>[Semantic Search (Embeddings)](reference-ai-agents-semantic-search-embeddings.md)
- <a id="llm-agent-conversations"></a>[LLM Agent Conversations](reference-ai-agents-llm-agent-conversations.md)
- <a id="crm-outreach-agent-agentscrm-outreach"></a>[CRM Outreach Agent (`@agents/crm-outreach`)](reference-ai-agents-crm-outreach-agent-agents-crm-outreach.md)
- <a id="customer-support-agent-agentscustomer-support"></a>[Customer Support Agent (`@agents/customer-support`)](reference-ai-agents-crm-outreach-agent-agents-crm-outreach.md#customer-support-agent-agentscustomer-support)
- <a id="shared-tool-call-loop-agents_shared"></a>[Shared Tool-Call Loop (`@agents/_shared`)](reference-ai-agents-crm-outreach-agent-agents-crm-outreach.md#shared-tool-call-loop-agents_shared)
- <a id="prompt-injection-protection"></a>[Prompt Injection Protection](reference-ai-agents-crm-outreach-agent-agents-crm-outreach.md#prompt-injection-protection)
- <a id="related"></a>[Related](reference-ai-agents-crm-outreach-agent-agents-crm-outreach.md#related)
