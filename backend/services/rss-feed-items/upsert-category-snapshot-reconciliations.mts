import type { RssFeedItemWithHash } from './upsert-prepare.mts'

export function snapshotsForRssFeedItemRows(
  itemsWithHashes: RssFeedItemWithHash[],
  rows: Array<{ id: string; guid: string }>,
) {
  const categoriesByGuid = new Map(
    itemsWithHashes.map(item => [item.feedItem.guid, item.feedItem.categories] as const),
  )
  return rows
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .flatMap(row => {
      const categories = categoriesByGuid.get(row.guid)
      return categories === undefined ? [] : [{ rss_feed_item_id: row.id, categories }]
    })
}
