# Crawl Chunks

Crawl chunks are markdown results of each crawl chunked into separate rows.
Each chunk's `markdown` content is a chunk returned from `@jongleberry/vurst-markdown` with the `breadcrumb` and the `text` combined.
Each crawl chunk should also include the token count.

This repository should not contain any embedding logic, but should instead call such logic from the relevant embedding service (e.g. `@services/bedrock-embeddings` and `@queues/bedrock-embeddings`)

Note: embeddings are always created via batch.

## Related

- [Crawls Service](../crawls/README.md)
- [Bedrock Embeddings Service](../bedrock-embeddings/README.md)
