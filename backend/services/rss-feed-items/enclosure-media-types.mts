import type { TransactionQuery } from '@data-stores/psql'
import { upsertMediaTypeIds } from '@services/urls/media-types'
import type { RssFeedItemWithHash } from './upsert-prepare.mts'

export function resolveEnclosureMediaTypes(
  items: RssFeedItemWithHash[],
  query: TransactionQuery,
): Promise<Map<string, string | null>> {
  return upsertMediaTypeIds(
    items.flatMap(item => (item.feedItem.enclosure_type ? [item.feedItem.enclosure_type] : [])),
    { query },
  )
}
