# AI Agents reference

[Back to AI Agents](ai-agents.md)

## Semantic Search (Embeddings)

Posts and topics get vector embeddings for semantic similarity search.

- Embeddings generated with Amazon Nova 2 Multimodal Embeddings V1 through the
  [Bedrock embeddings pipeline](bedrock-embeddings.md) after content is created or updated
- Stored as pgvector columns on `posts` and `topics` tables
- Used by `similar_post_id` and `similar_topic_id` filters in post search
- Batch embedding system handles bulk reprocessing
