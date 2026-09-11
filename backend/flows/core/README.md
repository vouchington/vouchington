# Workflows System

Central FlowProducer system that orchestrates multi-queue job flows where a parent job depends on child jobs completing first.

This system has **no workers or processors** — it only owns the shared `FlowProducer` instance and the enqueue functions that call `flowProducer.add()`.

## Flows

- `enqueuePostAutotaggerFlow(postId, options?)` — runs Bedrock embeddings (and optionally moderation) as child jobs, then triggers the autotagger as the parent job once all children complete; `options.includeModeration` defaults to `true`

## Architecture

All `FlowProducer` instances are centralized here because they coordinate across multiple systems' queues and share the same Valkey connection. Individual systems own their queue names; `workflows` imports those names to build flows.

```
enqueuePostAutotaggerFlow
  ├── child: bedrock_embeddings_nova_multimodal_v1_single (post)
  ├── child: openai_moderation_omni_single (post)  [optional, includeModeration=true]
  └── parent: autotagger (post)  ← runs after all children complete
```

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Autotagger queue: [../../queues/ai-agents/README.md](../../queues/ai-agents/README.md)
- Bedrock embeddings queue: [../../queues/bedrock-embeddings/README.md](../../queues/bedrock-embeddings/README.md)
