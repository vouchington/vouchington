// Similarity thresholds await Gemini recalibration in #5635.
import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * Builds the standard set of embedding lookup CTEs used by post, topic, and RSS feed item search.
 *
 * Pass `semanticSearchEmbeddingVector` as the result of `pgvector.toSql(embedding)` — the caller
 * is responsible for the pgvector conversion so this module stays free of that dependency.
 *
 * Returns an array of CTE fragments (without the leading `WITH` keyword) ready to be merged into
 * a query's CTE list.
 */
export function buildEmbeddingCtes(options: {
  semanticSearchEmbeddingVector?: string
  similar_post_id?: string
  similar_topic_id?: string
  similar_rss_feed_item_id?: string
}): SQLStatement[] {
  const ctes: SQLStatement[] = []

  if (options.semanticSearchEmbeddingVector) {
    // Repeated references must still expose this immutable parameter to vector index planning.
    ctes.push(
      sql`semantic_search_embedding AS NOT MATERIALIZED (SELECT ${options.semanticSearchEmbeddingVector}::halfvec(1536) AS embedding)`,
    )
  }

  if (options.similar_post_id) {
    ctes.push(sql`
      similar_post_embedding AS (
        SELECT gemini_embedding_2_embedding AS embedding
        FROM posts
        WHERE id = ${options.similar_post_id}
          AND gemini_embedding_2_embedding IS NOT NULL
      )
    `)
  }

  if (options.similar_topic_id) {
    ctes.push(sql`
      similar_topic_embedding AS (
        SELECT gemini_embedding_2_embedding AS embedding
        FROM topics
        WHERE id = ${options.similar_topic_id}
          AND gemini_embedding_2_embedding IS NOT NULL
      )
    `)
  }

  if (options.similar_rss_feed_item_id) {
    ctes.push(sql`
      similar_rss_feed_item_embedding AS (
        SELECT r.gemini_embedding_2_embedding AS embedding
        FROM rss_feed_items r
        WHERE r.id = ${options.similar_rss_feed_item_id}
          AND r.gemini_embedding_2_embedding IS NOT NULL
      )
    `)
  }

  return ctes
}
