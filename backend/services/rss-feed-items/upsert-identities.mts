import type { TransactionQuery } from '@data-stores/psql'
import type { RssFeedItemWithHash } from './upsert-prepare.mts'

export async function upsertRssFeedItemIdentities(
  txQuery: TransactionQuery,
  urlHostnameId: string,
  itemsToUpsert: RssFeedItemWithHash[],
): Promise<Array<{ id: string; guid: string }>> {
  const guids: string[] = []
  for (const item of itemsToUpsert) guids.push(item.feedItem.guid)
  if (guids.length === 0) return []
  await txQuery(
    `/* upsertRssFeedItems:identities */
    INSERT INTO rss_feed_item_ids (url_hostname_id, guid)
    SELECT $1, input.guid
    FROM unnest($2::text[]) AS input(guid)
    ORDER BY input.guid
    ON CONFLICT (url_hostname_id, guid)
    DO NOTHING`,
    [urlHostnameId, guids],
  )
  const { rows } = await txQuery<{ id: string; guid: string }>(
    `/* upsertRssFeedItems:identitiesLookup */
    SELECT id, guid
    FROM rss_feed_item_ids
    WHERE url_hostname_id = $1
      AND guid = ANY($2::text[])
    ORDER BY guid`,
    [urlHostnameId, guids],
  )
  return rows
}
