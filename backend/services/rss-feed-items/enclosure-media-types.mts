import type { TransactionQuery } from '@data-stores/psql'
import { upsertMediaTypes } from '@services/urls/media-types'
import type { RssFeedItemWithHash } from './upsert-prepare.mts'

export async function resolveEnclosureMediaTypes(
  items: RssFeedItemWithHash[],
  query: TransactionQuery,
): Promise<Map<string, string | null>> {
  const values = [
    ...new Set(
      items.flatMap(item => {
        const mimeType = item.feedItem.enclosure_type
        return mimeType ? [mimeType.trim().toLowerCase()] : []
      }),
    ),
  ].toSorted()
  const ids = new Map<string, string | null>()
  for (const mimeType of values) {
    // oxlint-disable-next-line no-await-in-loop -- acquire shared lookup locks in a consistent order across feed batches.
    ids.set(mimeType, await upsertMediaTypes(mimeType, { query }))
  }
  return ids
}
