import {
  RSS_ITEM_URL_WRITE_RETURNING,
  RSS_ITEM_URL_WRITE_LOCKS,
  RSS_ITEM_URL_WRITE_BARRIER,
} from '@modules/feed-query-builders/rss-feed-item-url-write-barrier'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

type RankedItem = { id: string; urlId: string; isoDate: string }

export async function insertTestUrlRankingItems(
  hostnameId: string,
  items: Omit<RankedItem, 'id'>[],
): Promise<string[]> {
  const ids = items.map(() => uuidv7())
  await using transaction = await beginTransaction()
  await transaction(sql`/* insertTestUrlRankingItems:guids */
    INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
    SELECT id, ${hostnameId}, id::text FROM UNNEST(${ids}::uuid[]) id`)
  await transaction(sql`/* insertTestUrlRankingItems:items */
    INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
    SELECT id, url_id, jsonb_build_object('title', 'Ranking batch', 'isoDate', iso_date),
      sha256(id::text::bytea)
    FROM UNNEST(${ids}::uuid[], ${items.map(item => item.urlId)}::uuid[],
      ${items.map(item => item.isoDate)}::text[]) item(id, url_id, iso_date)`)
  await transaction.commit()
  return ids
}

export async function updateTestUrlRankingItems(items: RankedItem[]): Promise<void> {
  await write(sql`/* updateTestUrlRankingItems */
    UPDATE rss_feed_items SET url_id = changed.url_id,
      data = jsonb_set(data, '{isoDate}', to_jsonb(changed.iso_date))
    FROM UNNEST(${items.map(item => item.id)}::uuid[], ${items.map(item => item.urlId)}::uuid[],
      ${items.map(item => item.isoDate)}::text[]) changed(id, url_id, iso_date)
    WHERE rss_feed_items.id = changed.id`)
}

export async function deleteTestUrlRankingItems(ids: string[]): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* deleteTestUrlRankingItems:items */
    DELETE FROM rss_feed_items WHERE id = ANY(${ids}::uuid[])`)
  await transaction(sql`/* deleteTestUrlRankingItems:guids */
    DELETE FROM rss_feed_item_guids WHERE id = ANY(${ids}::uuid[])`)
  await transaction.commit()
}

export async function upsertTestUrlRankingItems(items: RankedItem[]): Promise<void> {
  await write(
    sql`/* upsertTestUrlRankingItems */
    WITH written_rss_feed_items AS (INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
    SELECT id, url_id, jsonb_build_object('title', 'Ranking upsert', 'isoDate', iso_date),
      sha256(id::text::bytea)
    FROM UNNEST(${items.map(item => item.id)}::uuid[], ${items.map(item => item.urlId)}::uuid[],
      ${items.map(item => item.isoDate)}::text[]) item(id, url_id, iso_date)
    ON CONFLICT (id) DO UPDATE SET url_id = EXCLUDED.url_id, data = EXCLUDED.data`.append(
      RSS_ITEM_URL_WRITE_RETURNING,
    ).append(`), ${RSS_ITEM_URL_WRITE_LOCKS}
      SELECT item.id, item.url_id, item.story_id, item.has_embedding, item.published_at
      FROM written_rss_feed_items item WHERE ${RSS_ITEM_URL_WRITE_BARRIER}`),
  )
}

export async function createTestUrlRankingItemIdentity(hostnameId: string): Promise<string> {
  const id = uuidv7()
  await write(sql`/* createTestUrlRankingItemIdentity */
    INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
    VALUES (${id}, ${hostnameId}, ${id})`)
  return id
}
