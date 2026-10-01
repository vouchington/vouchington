import sql from 'sql-template-strings'
import { beginTransaction } from '@data-stores/psql'

/** Ownership-scoped embedded rows for candidate caps and selective post-filter tests. */
export async function insertSemanticWindowPosts(
  userId: string,
  count: number,
  equalDistances = false,
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
      (ARRAY[1::real, CASE WHEN ${equalDistances} THEN 0::real ELSE ordinal::real / 1000 END]
        || array_fill(0::real, ARRAY[1022]))::vector(1024)
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
  await transaction.commit()
  return ids
}
