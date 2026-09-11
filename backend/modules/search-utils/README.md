# @modules/search-utils

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

### Filtered vector scan

- `applyFilteredVectorScan(query)` — sets `hnsw.iterative_scan = strict_order` once per transaction before a filtered HNSW query so small `LIMIT` windows still refill after `WHERE` filters. Use this for unbounded ANN search (posts semantic tools). Do not add a production candidate-ID filter to those queries; dirty-DB fixture isolation belongs in `queryPostSemanticFixturesScopedToIds`.

### Pagination

- `buildCountQuery(baseQuery)` — wraps a SQL query in `COUNT(*)` for total count fetches

## Related

- Parent: [../README.md](../README.md)
- Pagination module: [../pagination/README.md](../pagination/README.md)
