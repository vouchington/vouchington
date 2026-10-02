# @modules/search-utils

Source entrypoint: [backend/modules/search-utils/README.md](../../../../../../backend/modules/search-utils/README.md)

Shared SQL query-building utilities for search across posts, topics, comments, and RSS feed items.

## Exports

### Limits

- `MIN_LIMIT`, `MAX_LIMIT`, `DEFAULT_LIMIT`, `ANON_MAX_LIMIT`, `TRENDING_TOPICS_DEFAULT_LIMIT`
- `clampLimit(limit, default)`, `clampAnonLimit(limit)`, `clampMaxDepth(maxDepth)`

### Embedding CTEs

- `buildEmbeddingCtes(options)` — builds pgvector similarity-search SQL CTEs for semantic/similar search
- `EMBEDDING_DISTANCE_THRESHOLD` — default distance cutoff (`0.75`)

### Search detection

- `hasTextSearch(options)`, `hasSemanticSearch(options)`, `hasSimilaritySearch(options)`, `detectSearchSort(options)`
- `detectCommentSort(options)`, `mapCommentRow(row)`
- `detectTopicSort(options)`

### Ranking

- `buildSemanticRankingScore(embeddingColumn, signals)` — builds a geometric-mean semantic ranking SQL expression

### Pagination

- `buildCountQuery(baseQuery)` — wraps a SQL query in `COUNT(*)` for total count fetches

## Semantic post search plan

Semantic post queries use a distance-ordered, materialized candidate window shared by REST and MCP.
The outer query applies the existing ranking formula and cursor to the candidates; facets count
those same candidates. Approximate recall and capped pagination were accepted for
[#1549](https://github.com/vouchington/vouchington/issues/1549).

The previous query used distance only as a threshold predicate, then sorted by ranking or recency.
It could not use HNSW: relevance evaluated vectors across the eligible corpus, and sparse recency
matches could require long scans. Hybrid prepared statements could also adopt a slower generic
text-search plan. The current nearest-neighbour window enables HNSW, while the read transaction
uses finite iterative scan limits and forces a custom plan. No connection-wide setting changes.

See [Searching Posts](../../../services/posts/search/README.md#semantic-search-plan) for filtering,
recall and pagination semantics, and `backend/services/posts/search/execute-query.mts` for settings.
The explain-analyze seed includes representative post embeddings; semantic and hybrid scenarios
compare custom and generic plans. Similar-item requests retain their existing query behavior.

## Related

- Parent: [../README.md](../README.md)
- Pagination module: [../pagination/README.md](../pagination/README.md)
