import {
  snapshotKeyPayloadSql,
  retainedKeyPayloadSql,
} from '../../services/post-publication/concrete-key-columns.mts'
import { retainPublicationIdentityBridges } from '../../services/post-publication/identity-bridges.mts'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestTopicBatch } from './topics/core.mts'
import { insertTestUrlDirect } from './urls.mts'
import { insertTestStory, setTestItemStoryId } from './stories.mts'
import { insertTestRssFeedItem } from './rss-feed-items.mts'
import { insertSnapshotKeys } from '../../services/post-publication/snapshot-key-writes.mts'
import type { PublicationSnapshotKey } from '../../services/post-publication/identity-source.mts'
import type { PublicationProjectionIdentity } from '../../services/post-publication/projection-identity.mts'
export async function insertTestPublicationTopicSlugFanout(
  postId: string,
  authorId: string,
  count: number,
): Promise<{ topicIds: string[]; slugs: string[] }> {
  const prefix = `publication-${postId}`
  const topicIds = await insertTestTopicBatch({ count, createdById: authorId, prefix })
  const slugs = Array.from(
    { length: count },
    (_, index) => `${prefix}-${index.toString().padStart(6, '0')}`,
  )
  await using query = await beginTransaction()
  await query(sql`/* insertTestPublicationTopicFanout */ INSERT INTO post_data_point_topics (post_id, topic_id)
    SELECT ${postId}, id FROM UNNEST(${topicIds}::uuid[]) AS topic(id)`)
  await query(sql`/* insertTestPublicationSlugFanout */ INSERT INTO post_slugs (post_id, slug)
    SELECT ${postId}, slug FROM UNNEST(${slugs}::text[]) AS source(slug)`)
  await query.commit()
  return { topicIds, slugs }
}
export async function seedTestPublicationReceipt(
  postId: string,
  fingerprint: string,
  identity: PublicationProjectionIdentity,
  existingSnapshotId?: string,
): Promise<string> {
  await using query = await beginTransaction()
  await retainPublicationIdentityBridges(query, 'post', [postId])
  let snapshotId = existingSnapshotId
  if (!snapshotId) {
    const { rows } = await query<{ id: string }>(sql`/* seedTestPublicationReceiptSnapshot */
      INSERT INTO post_publication_identity_snapshots (dirty_work_id, generation, post_identity_id, eligibility_fingerprint, is_public, completed_at)
      VALUES (NULL, 1, ${postId}, ${fingerprint}, false, CURRENT_TIMESTAMP) RETURNING id`)
    snapshotId = rows[0]!.id
    const keys: PublicationSnapshotKey[] = [
      ...identity.topicIds.map(uuidValue => ({
        kind: 'topic' as const,
        uuidValue,
        textValue: null,
        postType: null,
        day: null,
      })),
      ...identity.identityKeys.map(
        key =>
          ({
            kind:
              key.kind === 'author' && !/^[0-9a-f-]{36}$/i.test(key.value)
                ? 'author_username'
                : key.kind,
            uuidValue:
              ['author', 'community', 'rss_feed'].includes(key.kind) &&
              /^[0-9a-f-]{36}$/i.test(key.value)
                ? key.value
                : null,
            textValue:
              ['author', 'community', 'rss_feed'].includes(key.kind) &&
              /^[0-9a-f-]{36}$/i.test(key.value)
                ? null
                : key.value,
            postType: null,
            day: null,
          }) as PublicationSnapshotKey,
      ),
      ...identity.sitemapTargets.map(({ postType, day }) => ({
        kind: 'sitemap_target' as const,
        uuidValue: null,
        textValue: null,
        postType,
        day,
      })),
    ]
    for (let offset = 0; offset < keys.length; offset += 100) {
      await insertSnapshotKeys(query, snapshotId, keys.slice(offset, offset + 100))
    }
  }
  await query(sql`/* seedTestPublicationReceipt */
    INSERT INTO post_publication_projection_receipts (post_identity_id, eligibility_fingerprint, applied_generation, applied_snapshot_id)
    VALUES (${postId}, ${fingerprint}, 1, ${snapshotId})
    ON CONFLICT (post_identity_id) DO UPDATE SET eligibility_fingerprint = EXCLUDED.eligibility_fingerprint,
      applied_snapshot_id = EXCLUDED.applied_snapshot_id`)
  await query.commit()
  return snapshotId
}
export async function readTestPublicationReceipt(
  postId: string,
): Promise<{ snapshotId: string; fingerprint: string } | undefined> {
  const { rows } = await write<{
    snapshotId: string
    fingerprint: string
  }>(sql`/* readTestPublicationReceipt */
    SELECT applied_snapshot_id AS "snapshotId", eligibility_fingerprint AS fingerprint FROM post_publication_projection_receipts WHERE post_identity_id = ${postId}`)
  return rows[0]
}

export async function readTestPublicationRetainedKeys(
  workId: string,
): Promise<Array<{ kind: string; value: string }>> {
  const { rows } = await write<{
    kind: string
    value: string
  }>(
    `/* readTestPublicationRetainedKeys */
    SELECT kind, COALESCE(uuid_value::text, text_value, post_type::text || ':' || day::text) AS value
    FROM (SELECT key.id, key.dirty_work_id, ${retainedKeyPayloadSql()} FROM post_publication_dirty_work_keys key) concrete_keys WHERE dirty_work_id = $1 ORDER BY kind, value`,
    [workId],
  )
  return rows
}

export async function insertTestPublicationFeedFanout(
  postId: string,
  authorId: string,
  topicIds: string[],
): Promise<string[]> {
  const url = await insertTestUrlDirect(authorId, `https://publication-${postId}.example.com/item`)
  if (!url) throw new Error('Expected publication URL')
  const { rows } = await write<{ id: string }>(sql`/* insertTestPublicationFeedFanout */
    WITH source AS (SELECT topic_id, ordinal FROM UNNEST(${topicIds}::uuid[]) WITH ORDINALITY AS input(topic_id, ordinal)), urls_inserted AS (
      INSERT INTO urls (url, hostname_id, pathname, search_params)
      SELECT 'https://publication-' || ${postId}::text || '.example.com/feed-' || ordinal,
        ${url.hostname.id}, '/feed-' || ordinal, '{}'::jsonb FROM source RETURNING id, pathname)
    INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title)
    SELECT urls_inserted.id, source.topic_id, 'Publication fixture feed' FROM urls_inserted
    JOIN source ON urls_inserted.pathname = '/feed-' || source.ordinal RETURNING id`)
  const feedIds = rows.map(row => row.id)
  const story = await insertTestStory()
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feedIds[0]!,
    urlId: url.id,
    guid: `publication-${postId}`,
    itemData: {},
    contentSha256: Buffer.alloc(32),
  })
  await setTestItemStoryId(itemId, story.id)
  await using query = await beginTransaction()
  await query(
    sql`/* attachTestPublicationStory */ INSERT INTO post__stories (post_id, story_id, initiated_by_id) VALUES (${postId}, ${story.id}, ${authorId})`,
  )
  await query(sql`/* attachTestPublicationFeedSources */ INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id)
    SELECT feed_id, ${itemId} FROM UNNEST(${feedIds}::uuid[]) AS source(feed_id) ON CONFLICT DO NOTHING`)
  await query.commit()
  return feedIds
}

export async function readTestPublicationSnapshot(snapshotId: string): Promise<{
  completed: boolean
  abandoned: boolean
  sourceCursor: string | null
  keys: Array<{ kind: string; value: string }>
}> {
  const { rows } = await write<{
    completed: boolean
    abandoned: boolean
    source_cursor: string | null
    kind: string | null
    value: string | null
  }>(
    `/* readTestPublicationSnapshot */
    SELECT snapshot.completed_at IS NOT NULL AS completed, snapshot.abandoned_at IS NOT NULL AS abandoned,
      snapshot.source_cursor_kind || ':' || snapshot.source_cursor_value AS source_cursor,
      key.kind, COALESCE(key.uuid_value::text, key.text_value, key.post_type::text || ':' || key.day::text) AS value
    FROM post_publication_identity_snapshots snapshot LEFT JOIN (SELECT key.snapshot_id, ${snapshotKeyPayloadSql()} FROM post_publication_identity_snapshot_keys key) key ON key.snapshot_id = snapshot.id
    WHERE snapshot.id = $1 ORDER BY key.kind, value`,
    [snapshotId],
  )
  if (!rows[0]) throw new Error('Expected test snapshot')
  return {
    completed: rows[0].completed,
    abandoned: rows[0].abandoned,
    sourceCursor: rows[0].source_cursor,
    keys: rows.flatMap(row =>
      row.kind && row.value ? [{ kind: row.kind, value: row.value }] : [],
    ),
  }
}
