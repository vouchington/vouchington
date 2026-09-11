import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function searchTopicsByPostEmbedding(
  postId: string,
  limit: number,
): Promise<{ id: string; name: string }[]> {
  const safeLimit = Math.min(Math.max(1, limit), 25)

  // Note: column-to-column distance (<=> here) does a sequential scan on topics —
  // HNSW indexes only accelerate queries with a constant vector on the right-hand side.
  const queryStatement = sql`/* searchTopicsByPostEmbedding */
    SELECT id, name FROM (
      SELECT t.id, t.name,
        (t.bedrock_nova_multimodal_v1_embedding <=> p.bedrock_nova_multimodal_v1_embedding) AS dist
      FROM topics t
      JOIN posts p ON p.id = ${postId}
      WHERE t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
        AND t.bedrock_nova_multimodal_v1_embedding IS NOT NULL
        AND p.bedrock_nova_multimodal_v1_embedding IS NOT NULL
    ) sub
    WHERE dist < 0.75
    ORDER BY dist
    LIMIT ${safeLimit}
  `

  const { rows } = await read(queryStatement)

  return rows.map(row => ({
    id: row.id,
    name: row.name,
  }))
}
