# AI Agents reference

[Back to AI Agents](ai-agents.md)

## CRM Outreach Agent (`@agents/crm-outreach`)

Drafts personalized outreach emails for influencers/contacts in the CRM. Called synchronously from the admin API when an admin requests an email draft.

- Tools: `search_posts`, `search_rss_feed_items`
- Max iterations: 3
- Output: JSON `{ subject, body_html, body_text }` parsed from model response
- Contact data is sanitized and wrapped with `wrapExternalContent()` before injection

Full reference: [backend/agents/crm-outreach/README.md](../../../backend/agents/crm-outreach/README.md)

## Customer Support Agent (`@agents/customer-support`)

Generates draft replies for customer support threads. Enqueued asynchronously when a new thread or inbound message is created.

- Tools: `search_support_messages` (RAG), `search_posts`, `search_rss_feed_items`
- Max iterations: 5
- Output: plain text draft stored in `support_messages` via `createSupportDraftMessage()`
- Thread messages are sanitized and wrapped with `wrapExternalContent()` before injection
- Runs as the `customer-support` system user with the `customer_support` role, not as an administrator
- Agent runs tracked in `support_agent_runs` table for observability

Full reference: [backend/agents/customer-support/README.md](../../../backend/agents/customer-support/README.md)

## Shared Tool-Call Loop (`@agents/_shared`)

Both the CRM and support agents use `runToolLoop()` from `@agents/_shared`:

```typescript
const { text, iterations, terminationReason } = await runToolLoop({
  model,
  instructions,
  tools,
  input,
  maxIterations,
  safetyIdentifier,
  extraParams,
})
```

On max iterations, it makes a final call with `tool_choice: 'none'` to extract a text response. See [backend/agents/\_shared/README.md](../../../backend/agents/_shared/README.md).

## Prompt Injection Protection

All external content (RSS feeds, crawled pages, user posts) passed to LLMs must go through `@jongleberry/vurst-prompt`. See [backend guidance](../../../backend/CLAUDE.md#rules).

## Related

- [Bedrock Embeddings](bedrock-embeddings.md) — embedding queues and batch pipelines
- [Customer Support](../../requirements/admin/CUSTOMER-SUPPORT.md) — support agent requirements
- [Backend rules](../../../backend/CLAUDE.md) — workspace service and data conventions
- [AI agent rules](../../../backend/agents/CLAUDE.md) — agent patterns and tool loop design
- [Backend service rules](../../../backend/services/CLAUDE.md) — service boundaries and mocking policy
- [Chat agent](../../../backend/agents/chat/README.md) — hosted chat lifecycle and continuation recovery
