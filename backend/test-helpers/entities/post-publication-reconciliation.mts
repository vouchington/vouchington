import { advisoryLockPool, read, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { writeTestPostPublicationProtocol as writePostPublicationProtocol } from '../data-stores/psql/post-publication-protocol.mts'

export async function countTestPostPublicationAdvisoryLockConnections(
  action: () => Promise<void>,
): Promise<number> {
  const originalConnect = advisoryLockPool.connect
  let connections = 0
  const patchedConnect = countConnection as typeof advisoryLockPool.connect

  async function countConnection() {
    connections += 1
    return Reflect.apply(originalConnect, advisoryLockPool, [])
  }
  advisoryLockPool.connect = patchedConnect
  try {
    await action()
    return connections
  } finally {
    if (advisoryLockPool.connect === patchedConnect) {
      advisoryLockPool.connect = originalConnect
    }
  }
}

export async function addTestPostDataPointTopic(postId: string, topicId: string): Promise<void> {
  await write(sql`
    /* addTestPostDataPointTopic */
    INSERT INTO post_data_point_topics (post_id, topic_id) VALUES (${postId}, ${topicId})
  `)
}

export async function deleteTestPostDataPointTopics(postId: string): Promise<void> {
  await write(sql`
    /* deleteTestPostDataPointTopics */
    DELETE FROM post_data_point_topics WHERE post_id = ${postId}
  `)
}

export async function updateTestPostSlug(postId: string, slug: string): Promise<void> {
  await write(sql`
    /* updateTestPostSlug */
    UPDATE post_slugs SET slug = ${slug} WHERE post_id = ${postId}
  `)
}

export async function updateTestPostSlugInTransaction(
  query: TransactionQuery,
  postId: string,
  slug: string,
): Promise<void> {
  await query(
    `/* updateTestPostSlugInTransaction */ UPDATE post_slugs SET slug = $1 WHERE post_id = $2`,
    [slug, postId],
  )
}

export async function listTestPostPublicationIdentityKeys(params: {
  authorUserId: string
  postId: string
}): Promise<Array<{ kind: string; value: string }>> {
  const { rows } = await read<{ kind: string; value: string }>(sql`
    /* listTestPostPublicationIdentityKeys */
    SELECT CASE key.kind
        WHEN 'identity_author' THEN 'author'
        WHEN 'identity_author_username' THEN 'author'
        WHEN 'identity_community' THEN 'community'
        WHEN 'identity_community_slug' THEN 'community_slug'
        WHEN 'identity_post_slug' THEN 'post_slug'
        WHEN 'identity_rss_feed' THEN 'rss_feed'
      END AS kind,
      COALESCE(key.uuid_value::text, key.text_value) AS value
    FROM post_publication_dirty_work_keys key
    JOIN post_publication_dirty_work work ON work.id = key.dirty_work_id
    WHERE work.author_user_id = ${params.authorUserId} OR work.post_id = ${params.postId}
    ORDER BY key.id
  `)
  return rows
}

export async function scrubTestUserUsernameInTransaction(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  await query(
    `/* scrubTestUserUsernameInTransaction */ UPDATE users SET username = NULL WHERE id = $1`,
    [userId],
  )
}

export async function getTestPostPublicationDirtyWorkGenerationForAuthor(
  authorUserId: string,
): Promise<{ id: string; generation: string } | undefined> {
  const { rows } = await read<{ id: string; generation: string }>(sql`
    /* getTestPostPublicationDirtyWorkGenerationForAuthor */
    SELECT id, generation FROM post_publication_dirty_work WHERE author_user_id = ${authorUserId}
  `)
  return rows[0]
}

export async function setTestPostPublicationDirtyWorkTopicCursor(params: {
  column: 'author_user_id' | 'rss_feed_id'
  scopeId: string
  cursorTopicId: string
}): Promise<void> {
  const column = params.column === 'author_user_id' ? sql`author_user_id` : sql`rss_feed_id`
  const statement = sql`
    /* setTestPostPublicationDirtyWorkTopicCursor */
    UPDATE post_publication_dirty_work
    SET cursor_topic_id = ${params.cursorTopicId}::uuid
    WHERE `
  statement.append(column).append(sql` = ${params.scopeId}::uuid
  `)
  await writePostPublicationProtocol(statement)
}

export async function getTestPostPublicationDirtyWorkTopicCursor(params: {
  column: 'author_user_id' | 'rss_feed_id'
  scopeId: string
}): Promise<{ generation: string; cursor_topic_id: string | null } | undefined> {
  const column = params.column === 'author_user_id' ? sql`author_user_id` : sql`rss_feed_id`
  const statement = sql`
    /* getTestPostPublicationDirtyWorkTopicCursor */
    SELECT generation, cursor_topic_id
    FROM post_publication_dirty_work
    WHERE `
  statement.append(column).append(sql` = ${params.scopeId}::uuid`)
  const { rows } = await read<{
    generation: string
    cursor_topic_id: string | null
  }>(statement)
  return rows[0]
}

export async function hasTestPostPublicationProjectionReceipt(postId: string): Promise<boolean> {
  const { rows } = await read<{ exists: boolean }>(sql`
    /* hasTestPostPublicationProjectionReceipt */
    SELECT EXISTS (
      SELECT 1 FROM post_publication_projection_receipts WHERE post_id = ${postId}
    ) AS exists
  `)
  return rows[0]?.exists ?? false
}

export async function createTestOrphanPostPublicationProjectionReceipts(
  dirtyWorkId: string,
  count: number,
): Promise<string[]> {
  const { rows } = await writePostPublicationProtocol<{ post_id: string }>(sql`
    /* createTestOrphanPostPublicationProjectionReceipts */
    WITH orphan_ids AS MATERIALIZED (
      SELECT uuidv7() AS post_id FROM generate_series(1, ${count})
    ), inserted_receipts AS (
      INSERT INTO post_publication_projection_receipts (
        post_id, eligibility_fingerprint, applied_generation
      )
      SELECT post_id, 'test-orphan-receipt', 1 FROM orphan_ids
      RETURNING post_id
    ), retained_impacts AS (
      INSERT INTO post_publication_dirty_work_keys (dirty_work_id, kind, uuid_value)
      SELECT ${dirtyWorkId}, 'impact_post', post_id FROM orphan_ids
      ON CONFLICT DO NOTHING
      RETURNING uuid_value
    )
    SELECT inserted_receipts.post_id
    FROM inserted_receipts
    JOIN retained_impacts ON retained_impacts.uuid_value = inserted_receipts.post_id
    ORDER BY inserted_receipts.post_id
  `)
  return rows.map(row => row.post_id)
}
