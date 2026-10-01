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

### Filtered vector scan

- `applyFilteredVectorScan(query)` — sets `hnsw.iterative_scan = strict_order` once per transaction before a filtered HNSW query so small `LIMIT` windows still refill after `WHERE` filters. Use this for unbounded ANN search (posts semantic tools). Do not add a production candidate-ID filter to those queries; dirty-DB fixture isolation belongs in `queryPostSemanticFixturesScopedToIds`.

### Pagination

- `buildCountQuery(baseQuery)` — wraps a SQL query in `COUNT(*)` for total count fetches

## Semantic post search plan

Finding: the shared REST (`GET /api/v1/posts`) and MCP `search_posts` semantic query never uses the pgvector HNSW index, so `hnsw.iterative_scan` does not apply to it and no index window can under-fill a page. Its cost is a distance computation for every candidate row instead.

Why:

- An HNSW index serves only an ordered nearest-neighbour scan: `ORDER BY embedding <=> query LIMIT n`.
- The shared query filters with a distance threshold (`EMBEDDING_DISTANCE_THRESHOLD`, via `appendEmbeddingDistance` in the posts query builder) and orders by `ranking_score DESC, posts.id DESC` or `posts.id DESC`. A threshold predicate is not an index-ordered scan, and `1/(1+distance)` (or `ts_rank` times it for hybrid search) is a computed expression, so the planner cannot use the index for either.
- The other filters (privacy, moderation, post type, cursor) all run as ordinary predicates over the same rows, so the page fills exactly as for any non-vector search.

Custom-plan shapes (see the generic-plan note below), captured with `EXPLAIN (ANALYZE, BUFFERS)` on a disposable database holding about 40k synthetic embedded posts (the stock explain seed leaves `posts` embeddings null, which makes semantic plans meaningless):

| Query shape                                                 | Plan                                                            | Cost                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Nearest-neighbour control (`ORDER BY` distance `LIMIT n`)   | HNSW index scan                                                 | a few ms                                                   |
| `semantic_search_query`, `sort=relevance` (also hybrid)     | parallel Seq Scan, then top-N sort on the ranking score         | about 100 ms; most of it is reading and detoasting vectors |
| `semantic_search_query`, `sort=new` (also hybrid)           | `posts` primary-key backward scan with the distance as a filter | about 2 ms; rejects rows until the page fills              |
| `similar_post_id` / `similar_rss_feed_item_id`, either sort | `posts` primary-key backward scan with the distance as a filter | about 2 ms                                                 |

What this means:

- Relevance-sorted semantic and hybrid pages are linear in the number of embedded posts that pass the other filters. The distance needs the full stored vector, so block reads dominate.
- Recency-sorted pages stay cheap only while enough rows fall under the threshold. A sparse match set makes the backward scan walk further before the page fills.
- Similar-item requests have no ranking expression, so `sort=relevance` falls back to `posts.id DESC` within the threshold. This is current behavior, not a plan artifact.
- Production sends this query as a named prepared statement (`@vouchington/postgres` names every annotated query), and nothing forces `plan_cache_mode`, so under the default `auto` a pooled connection can switch to a generic plan after several executions. For hybrid queries the generic plan can differ from the custom one: it picked a `search_vector` bitmap scan, which took `sort=new` from about 2 ms to about 214 ms and `sort=relevance` from about 92 ms to about 146 ms on the seed. Semantic-only and `similar_*` plans did not change. The explain tooling's `EXPLAIN_PLAN_CACHE_MODE=compare` mode exists to catch exactly this, so check both plans when changing the query.
- Do not add `hnsw.iterative_scan` to this query. It only matters for an ordered nearest-neighbour scan with post-filters.

Whether relevance and hybrid search need a distance-ordered candidate window is tracked in [#1549](https://github.com/vouchington/vouchington/issues/1549). Any such window must keep exact ordering for semantic-only relevance (an approximate index window is a ranking change), stay one shared query for REST and MCP, and keep cursor pagination on `ranking_score`.

To reproduce, seed embeddings into a disposable database, then capture `buildPostSearchQuery` output with `semanticSearchEmbedding` supplied (the same single query `getPostIds` issues, minus the embedding fetch) through the [explain-analyze tooling](../../../../../development/postgresql/explain-analyze/README.md). Compare `EXPLAIN_PLAN_CACHE_MODE=compare` runs for custom and generic plans.

The posts query builder notes are in [Searching Posts](../../../services/posts/search/README.md#semantic-search-plan).

## Related

- Parent: [../README.md](../README.md)
- Pagination module: [../pagination/README.md](../pagination/README.md)
