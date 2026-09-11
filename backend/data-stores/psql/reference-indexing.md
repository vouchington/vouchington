# Indexing

[Back to PostgreSQL Data Store](README.md#indexing)

- Use partial indexes for soft-deleted and filtered access patterns.
- Use generated columns when possible, and index them only when queries need them.
- For Bedrock embeddings, use HNSW indexes with `vector_cosine_ops`.
- For substring text search, use `GIN (... gin_trgm_ops)`.
- For full-text search, prefer `search_vector @@ websearch_to_tsquery(...)` with a GIN index.
