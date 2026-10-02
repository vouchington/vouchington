import { randomBytes } from 'node:crypto'
import sql from 'sql-template-strings'
import pgvector from 'pgvector'
import { beginTransaction } from '@data-stores/psql'

/** Random direction keeps persistent ANN fixtures apart without duplicate vectors. */
export function createSemanticWindowEmbedding(): number[] {
  const coordinates = [...randomBytes(32)].map(value => value / 255 - 0.5)
  const magnitude = Math.hypot(...coordinates)
  return [...coordinates.map(value => value / magnitude), ...Array<number>(992).fill(0)]
}

/** Ownership-scoped embedded rows for candidate caps and selective post-filter tests. */
export async function insertSemanticWindowPosts(
  userId: string,
  count: number,
  embedding: number[],
): Promise<string[]> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`/* insertSemanticWindowPosts */
    INSERT INTO posts (
      post_type, title, markdown, created_by_id, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256,
      bedrock_nova_multimodal_v1_embedding
    )
    SELECT 'discussion', 'Semantic window fixture', 'Semantic window fixture', ${userId}::uuid,
      'system', decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex'),
      (${embedding.slice(0, 32)}::real[] || ARRAY[ordinal::real / ${count}::real]
        || array_fill(0::real, ARRAY[991]))::vector(1024)
    FROM generate_series(1, ${count}::integer) AS ordinal
    RETURNING id
  `)
  const ids = rows.map(row => row.id)
  await transaction(sql`/* insertSemanticWindowPosts */
    WITH changes AS (
      INSERT INTO post_clearance_changes (post_id, change_type, metadata)
      SELECT id, 'approve', '{"source":"semantic-window-test"}'::jsonb
      FROM posts WHERE id = ANY(${ids}::uuid[])
      RETURNING id, post_id, created_at
    )
    UPDATE posts SET latest_clearance_change_id = changes.id, approved_at = changes.created_at
    FROM changes WHERE posts.id = changes.post_id
  `)
  const { rows: ordered } = await transaction<{ id: string }>(sql`/* insertSemanticWindowPosts */
    SELECT id FROM posts WHERE id = ANY(${ids}::uuid[])
    ORDER BY bedrock_nova_multimodal_v1_embedding <=> ${pgvector.toSql(embedding)}::vector, id
  `)
  await transaction.commit()
  return ordered.map(row => row.id)
}
