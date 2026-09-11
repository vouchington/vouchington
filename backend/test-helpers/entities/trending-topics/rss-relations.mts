import { read, beginTransaction } from '@data-stores/psql'
import { insertTestUrlDirect } from '../urls.mts'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { createRandomString } from '../../data.mts'

export async function insertBatchRssRelations(params: {
  count: number
  topicId: string
  feedId: string
  userId: string
  netVote: number
  createdAt?: Date
  tableName: string
}) {
  const { count, topicId, feedId, userId, netVote, createdAt, tableName } = params
  const urlHostnameId = await getFeedHostnameId(feedId)
  const now = Date.now()
  const itemTimestampMs = createdAt ? createdAt.getTime() - 1 : now - 1
  const relationTimestampMs = createdAt ? createdAt.getTime() : now
  const sha256 = Buffer.alloc(32, 0)
  const rows = await createRssFeedItemRows(count, itemTimestampMs)
  const itemIds = rows.map(r => r.itemId)
  const urlIds = rows.map(r => r.urlId)
  const guids = rows.map(r => r.guid)

  const scoreUp = netVote > 0 ? 1 : 0
  const scoreDown = netVote < 0 ? 1 : 0
  const relationIds = Array.from({ length: count }, () => uuidv7({ msecs: relationTimestampMs }))
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* insertBatchRssRelations:identities */
        INSERT INTO rss_feed_item_ids (id, url_hostname_id, guid)
        SELECT r.item_id, ${urlHostnameId}, r.guid
        FROM UNNEST(${itemIds}::uuid[], ${guids}::text[]) AS r(item_id, guid)
        ON CONFLICT (url_hostname_id, guid) DO NOTHING`)

    await query(sql`/* insertBatchRssRelations:items */
        INSERT INTO rss_feed_items (
          id,
          url_id,
          data,
          bedrock_nova_multimodal_v1_content_sha256
        )
        SELECT r.item_id, r.url_id, '{"title":"Test Item"}'::jsonb, ${sha256}
        FROM UNNEST(${itemIds}::uuid[], ${urlIds}::uuid[]) AS r(item_id, url_id)
        ON CONFLICT (id) DO NOTHING`)

    await query(sql`/* insertBatchRssRelations:sources */
        INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
        SELECT ${feedId}, input.item_id, items.published_at
        FROM UNNEST(${itemIds}::uuid[]) AS input(item_id)
        LEFT JOIN rss_feed_items items ON items.id = input.item_id
        ON CONFLICT DO NOTHING`)

    await query(
      sql`/* insertBatchRssRelations:relations */
        INSERT INTO `
        .append(tableName)
        .append(
          sql` (id, subject_id, object_id, created_by_id, votes_score_up, votes_score_down)
        SELECT r.relation_id, r.item_id, ${topicId}, ${userId}, ${scoreUp}, ${scoreDown}
        FROM UNNEST(${relationIds}::uuid[], ${itemIds}::uuid[]) AS r(relation_id, item_id)`,
        ),
    )
    await transaction.commit()
  }
}

async function getFeedHostnameId(feedId: string) {
  const { rows: feedRows } = await read(sql`/* insertBatchRssRelations:feedHostname */
    SELECT u.hostname_id
    FROM rss_feeds f
    JOIN urls u ON u.id = f.rss_feed_url_id
    WHERE f.id = ${feedId}
    LIMIT 1
  `)
  const urlHostnameId = feedRows[0]?.hostname_id as string | undefined
  if (!urlHostnameId) throw new Error('insertBatchRssRelations: feed not found')
  return urlHostnameId
}

async function createRssFeedItemRows(count: number, itemTimestampMs: number) {
  const rows: { itemId: string; urlId: string; guid: string }[] = []
  for (let i = 0; i < count; i++) {
    const itemRandom = createRandomString(13)
    const urlObj = await insertTestUrlDirect(null, `https://example.com/item-${itemRandom}`, {
      content_type: 'text/html',
    })
    rows.push({
      itemId: uuidv7({ msecs: itemTimestampMs }),
      urlId: urlObj!.id,
      guid: `guid-${itemRandom}`,
    })
  }
  return rows
}
