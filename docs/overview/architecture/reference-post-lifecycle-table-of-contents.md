# Post / Comment Creation Pipeline reference

[Back to Post / Comment Creation Pipeline](post-lifecycle.md)

## Table of Contents

- [Overview](#overview)
- [Post Creation Pipeline](reference-post-lifecycle-post-creation-pipeline.md#post-creation-pipeline)
- [Comment-Specific Behavior](reference-post-lifecycle-comment-specific-behavior.md#comment-specific-behavior)
- [Post Update Pipeline](reference-post-lifecycle-comment-specific-behavior.md#post-update-pipeline)
- [Community Moderation Pipeline](reference-post-lifecycle-community-moderation-pipeline.md#community-moderation-pipeline)
- [Clearance Gate](reference-post-lifecycle-post-creation-pipeline.md#clearance-gate)
- [Review Succession](../../requirements/content/reference-post-lifecycle-review-succession.md)
- [Notification Reconciliation](reference-post-lifecycle-community-moderation-pipeline.md#notification-reconciliation)

---

## Overview

Post creation is split into two phases:

1. **Synchronous (HTTP request)**: `createPost()` runs a database transaction that inserts the post
   and associated data, then returns immediately.
2. **Asynchronous (job queues)**: `enqueueOnPostCreated()` fans out to multiple independent
   pipelines — moderation, spam detection, embeddings, notifications, sitemap, etc.

The pipelines are independent and resilient: each retries on failure without affecting the others.
Admin-created posts use a reduced create-time branch: they record an `approve` clearance change, skip
moderation/spam/community-moderation on create, and still run embeddings plus autotagger.

```mermaid
flowchart TD
  request[Create post request] --> txn[createPost transaction]
  txn --> events[enqueueOnPostCreated]
  events --> listener[entity-listeners processPostCreated]
  listener --> omni[OpenAI omni moderation]
  listener --> spam[Spam detection]
  listener --> embeds[Embeddings and autotagger]
  listener --> notify[Notification reconciliation]
  omni --> gate[Clearance gate]
  spam --> gate
  gate --> approved{Approved?}
  approved -- Yes --> agents[LLM moderator agents]
  approved -- No --> hidden[Post hidden or rejected]
  agents --> review[Tags or review queue actions]
```

---
