import type { RssFeedItemWithHash } from './upsert-prepare.mts'

export function orderUpsertedRowsByInput<T extends { guid: string }>(
  items: readonly RssFeedItemWithHash[],
  rows: T[],
): T[] {
  const orderByGuid = new Map<string, number>()
  for (let index = 0; index < items.length; index++) {
    orderByGuid.set(items[index]!.feedItem.guid, index)
  }
  const decorated: Array<{ row: T; order: number }> = []
  for (const row of rows) decorated.push({ row, order: orderByGuid.get(row.guid)! })
  decorated.sort(compareDecoratedUpsertOrder)
  const ordered: T[] = []
  for (const entry of decorated) ordered.push(entry.row)
  return ordered
}

export function filterInsertedUnchangedSourceRows(
  insertedRows: Array<{ rss_feed_item_id: string }>,
  unchangedRows: Array<{ id: string }>,
): Array<{ rss_feed_item_id: string }> {
  const unchangedIds = new Set<string>()
  for (const row of unchangedRows) unchangedIds.add(row.id)
  const filtered: Array<{ rss_feed_item_id: string }> = []
  for (const row of insertedRows) {
    if (unchangedIds.has(row.rss_feed_item_id)) filtered.push(row)
  }
  return filtered
}

export function sortRssFeedItemsByIdentityId<T extends { feedItem: { guid: string } }>(
  items: T[],
  identityIdsByGuid: ReadonlyMap<string, string>,
): T[] {
  const decorated: Array<{ item: T; identityId: string }> = []
  for (const item of items) {
    decorated.push({ item, identityId: identityIdsByGuid.get(item.feedItem.guid)! })
  }
  decorated.sort(compareDecoratedRssFeedItemIdentityIds)
  const sorted: T[] = []
  for (const entry of decorated) sorted.push(entry.item)
  return sorted
}

export function unchangedUnlinkedExistingRowsWithInsertedSources<
  T extends { id: string },
  S extends { rss_feed_item_id: string },
>(unchangedUnlinkedExistingRows: T[], insertedSourceRows: S[]): T[] {
  const insertedIds = new Set<string>()
  for (const source of insertedSourceRows) insertedIds.add(source.rss_feed_item_id)
  const rows: T[] = []
  for (const row of unchangedUnlinkedExistingRows) {
    if (insertedIds.has(row.id)) rows.push(row)
  }
  return rows
}

function compareDecoratedUpsertOrder(left: { order: number }, right: { order: number }): number {
  return left.order - right.order
}

function compareDecoratedRssFeedItemIdentityIds(
  left: { identityId: string },
  right: { identityId: string },
): number {
  return left.identityId.localeCompare(right.identityId)
}
