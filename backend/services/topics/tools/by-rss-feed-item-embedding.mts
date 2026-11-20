import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function searchTopicsByRssFeedItemEmbedding(
  rssFeedItemId: string,
  limit: number,
  query: QueryExecutor = read,
): Promise<{ id: string; name: string }[]> {
  const safeLimit = Math.min(Math.max(1, limit), 25)

  // Note: column-to-column distance (<=> here) does a sequential scan on topics —
  // HNSW indexes only accelerate queries with a constant vector on the right-hand side.
  const queryStatement = sql`/* searchTopicsByRssFeedItemEmbedding */
    SELECT id, name FROM (
      SELECT t.id, t.name,
        (t.gemini_embedding_2_embedding <=> r.gemini_embedding_2_embedding) AS dist
      FROM topics t
      JOIN rss_feed_items r ON r.id = ${rssFeedItemId}
      WHERE t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
        AND t.gemini_embedding_2_embedding IS NOT NULL
        AND r.gemini_embedding_2_embedding IS NOT NULL
    ) sub
    WHERE dist < 0.75
    ORDER BY dist, id
    LIMIT ${safeLimit}
  `

  const { rows } = await query<{ id: string; name: string }>(queryStatement)

  return rows.map(row => ({
    id: row.id,
    name: row.name,
  }))
}
