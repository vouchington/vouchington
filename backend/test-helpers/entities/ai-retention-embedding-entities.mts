import type { TransactionQuery } from '@data-stores/psql'

export async function insertEmbeddingRetentionPosts(query: TransactionQuery, count: number) {
  const { rows: users } = await query<{ id: string }>(
    `/* insertEmbeddingRetentionUser */ INSERT INTO users (username) VALUES (NULL) RETURNING id`,
  )
  const { rows } = await query<{ id: string }>(
    `/* insertEmbeddingRetentionPosts */
    INSERT INTO posts (post_type, title, markdown, created_by_id,
      broadcast, privacy, is_anonymous, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT 'discussion', 'Embedding retention fixture', 'Owned association fixture', $1::uuid,
      'everyone', 'public', FALSE, 'system', decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
    FROM generate_series(1, $2::integer) RETURNING id`,
    [users[0]!.id, count],
  )
  return rows.map(row => row.id)
}

export async function insertEmbeddingBatchEntitiesForRetentionTest(
  query: TransactionQuery,
  batchId: string,
  postIds: readonly string[],
): Promise<void> {
  await query(
    `/* insertEmbeddingBatchEntitiesForRetentionTest */
    INSERT INTO bedrock_embedding_batch_entities (batch_id, entity_type, post_id)
    SELECT $1::uuid, 'posts', unnest($2::uuid[])`,
    [batchId, postIds],
  )
}

export async function countEmbeddingBatchEntitiesForRetentionTest(
  query: TransactionQuery,
  batchId: string,
): Promise<number> {
  const { rows } = await query<{ count: number }>(
    `/* countEmbeddingBatchEntitiesForRetentionTest */
    SELECT count(*)::int AS count FROM bedrock_embedding_batch_entities WHERE batch_id = $1::uuid`,
    [batchId],
  )
  return rows[0]!.count
}
