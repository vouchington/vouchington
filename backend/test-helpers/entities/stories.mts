import { beginTransaction, write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { Story } from '@voucha/types/entities/story'

export async function insertTestStory(
  options: {
    title?: string
    officialRssFeedItemId?: string | null
    officialLockedAt?: Date | null
  } = {},
): Promise<Story> {
  const { rows } = await write(
    sql`/* insertTestStory */
    INSERT INTO stories (title, official_rss_feed_item_id, official_locked_at)
    VALUES (
      ${options.title ?? null},
      ${options.officialRssFeedItemId === undefined ? null : options.officialRssFeedItemId},
      ${options.officialLockedAt === undefined ? null : options.officialLockedAt}
    )
    RETURNING
      id,
      title,
      cluster_reason,
      published_at,
      official_rss_feed_item_id,
      official_locked_at,
      uuid_extract_timestamp(id) AS created_at,
      updated_at,
      deleted_at
  `,
  )
  return rows[0] as Story
}

/**
 * Assign an RSS feed item to a story directly (bypasses locks, for test setup only).
 */
export async function setTestItemStoryId(itemId: string, storyId: string | null): Promise<void> {
  await write(sql`/* setTestItemStoryId */
    UPDATE rss_feed_items SET story_id = ${storyId} WHERE id = ${itemId}
  `)
}

/**
 * Mark an RSS feed item as story-locked (simulates admin lock).
 */
export async function setTestItemStoryLocked(itemId: string, locked: boolean): Promise<void> {
  const lockedAt = locked ? new Date() : null
  await write(sql`/* setTestItemStoryLocked */
    UPDATE rss_feed_items SET story_locked_at = ${lockedAt} WHERE id = ${itemId}
  `)
}

/**
 * Get URL IDs linked to a post via the post→related→url entity relation.
 */
export async function getPostRelatedUrlIds(postId: string): Promise<string[]> {
  const { rows } = await read(sql`/* getPostRelatedUrlIds */
    SELECT object_id FROM relation__post__related__url
    WHERE subject_id = ${postId} AND deleted_at IS NULL
  `)
  return rows.map(r => r.object_id as string)
}

export async function insertTestStoryRssFeedItemsBatch(options: {
  storyId: string
  urlId: string
  count: number
}): Promise<void> {
  let inserted = 0
  while (inserted < options.count) {
    const batchSize = Math.min(10_000, options.count - inserted)
    const { rowCount } = await write(sql`/* insertTestStoryRssFeedItemsBatch */
      WITH generated AS (
        SELECT uuidv7() AS id, 'story-projection-' || uuidv7()::text AS guid
        FROM generate_series(1, ${batchSize})
      ), identities AS (
        INSERT INTO rss_feed_item_ids (id, url_hostname_id, guid)
        SELECT generated.id, urls.hostname_id, generated.guid
        FROM generated
        CROSS JOIN urls
        WHERE urls.id = ${options.urlId}
        RETURNING id
      )
      INSERT INTO rss_feed_items (
        id, url_id, data, bedrock_nova_multimodal_v1_content_sha256, story_id
      )
      SELECT id, ${options.urlId}, '{}'::jsonb, decode(repeat('00', 32), 'hex'), ${options.storyId}
      FROM identities
    `)
    if (rowCount !== batchSize) {
      throw new Error(
        `insertTestStoryRssFeedItemsBatch: expected batch of ${batchSize} rows, inserted ${rowCount}`,
      )
    }
    inserted += rowCount
  }
  if (inserted !== options.count) {
    throw new Error(
      `insertTestStoryRssFeedItemsBatch: expected ${options.count} rows, inserted ${inserted}`,
    )
  }
}

/**
 * Get topic IDs linked to a post via the post→category→topic entity relation.
 */
export async function getPostCategoryTopicIds(postId: string): Promise<string[]> {
  const { rows } = await read(sql`/* getPostCategoryTopicIds */
    SELECT object_id FROM relation__post__category__topic
    WHERE subject_id = ${postId} AND deleted_at IS NULL
  `)
  return rows.map(r => r.object_id as string)
}

export async function isTestStoryLifecycleLockWaiting(storyId: string): Promise<boolean> {
  const lockKey = `story-lifecycle:${storyId}`
  const { rows } = await read<{ waiting: boolean }>(sql`
    /* isTestStoryLifecycleLockWaiting */
    SELECT EXISTS (
      SELECT 1 FROM pg_locks
      WHERE locktype = 'advisory'
        AND NOT granted
        AND classid::bigint = ((hashtextextended(${lockKey}, 0) >> 32) & 4294967295)
        AND objid::bigint = (hashtextextended(${lockKey}, 0) & 4294967295)
    ) AS waiting
  `)
  return rows[0]?.waiting ?? false
}

export async function withTestStoryLifecycleLock<T>(
  storyId: string,
  callback: () => Promise<T>,
): Promise<T> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* withTestStoryLifecycleLock */
          SELECT pg_advisory_xact_lock(hashtextextended('story-lifecycle:' || $1::text, 0))`,
      [storyId],
    )
    const result = await callback()
    await transaction.commit()
    return result
  }
}
