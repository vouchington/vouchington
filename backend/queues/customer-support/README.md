# @queues/customer-support

Job queue system for the customer support feature. Processes AI response generation and message embedding.

## Architecture

- **Queue**: `customer_support` (Valkey/Redis Streams via glide-mq)
- **Worker**: `customer_support` worker in [`backend/workers/customer-support/workers/customer-support.mts`](../../workers/customer-support/workers/customer-support.mts)
- **Concurrency**: 5 parallel jobs

## Processors

| Queue              | Processor                 | Dedup Key                                               | Default Priority |
| ------------------ | ------------------------- | ------------------------------------------------------- | ---------------- |
| `customer_support` | `generateSupportResponse` | `generate_support_response_<threadId>` (debounce 1 min) | 10               |
| `customer_support` | `embedSupportMessage`     | `embed_support_message_<threadId>_<msgId>` (simple)     | 10               |

### `generateSupportResponse`

Invokes `@agents/customer-support` → `generateSupportResponse(threadId)` to draft an AI response for the latest inbound message on the thread.

- **Triggered by**: new thread creation (user web form or the `ses_inbound` worker)
- **Retry**: 3 attempts with exponential backoff (1s base)
- **Rate limit handling**: `handleBedrockRateLimit` pauses the worker on Bedrock throttling responses

### `embedSupportMessage`

Calls `@services/bedrock-embeddings` → `upsertSupportMessageEmbedding(message)` to generate and store a vector embedding for a support message, enabling semantic RAG search.

- **Triggered by**: new inbound or outbound message creation
- **Retry**: 3 attempts with exponential backoff (1s base)
- **Replay identity**: the support thread/message-derived logical ID is both the job ID and deduplication ID; SES inbound processing can supply its own stable per-message logical ID.

## Dependencies

- `@agents/customer-support` — AI draft generation
- `@services/customer-support` — message retrieval
- `@services/bedrock-embeddings` — vector embedding upsert
- `@modules/queue-errors` — Bedrock throttling and HTTP retry classification

## Enqueue Functions

All enqueue functions are in `enqueues.mts`:

- `enqueueGenerateSupportResponse(threadId, priority?)` — fire-and-forget, debounced
- `enqueueEmbedSupportMessage(threadId, messageId, priority?, logicalJobId?)` — one-shot enqueue with a stable job and deduplication ID

## Related

- AI agent: [backend/agents/customer-support/README.md](../../agents/customer-support/README.md)
- Service layer: [backend/services/customer-support/README.md](../../services/customer-support/README.md)
- Feature spec: [docs/requirements/admin/CUSTOMER-SUPPORT.md](../../../docs/requirements/admin/CUSTOMER-SUPPORT.md)
