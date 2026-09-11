import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import type { ExistingRssFeedItemRow } from './upsert-queries.mts'

export function enqueueTopHashtagRefreshIfNeeded(
  isEligibleTopHashtagSource: boolean,
  existingRows: ExistingRssFeedItemRow[],
  insertedSourceRows: Array<{ rss_feed_item_id: string }>,
  upsertedRows: Array<{ id: string; published_at: Date }>,
) {
  const existingRowsById = new Map(existingRows.map(row => [row.id, row]))
  const eligibleSourceLinked =
    isEligibleTopHashtagSource &&
    (insertedSourceRows.some(
      row => !existingRowsById.get(row.rss_feed_item_id)?.has_eligible_source,
    ) ||
      upsertedRows.some(row => {
        const existing = existingRowsById.get(row.id)
        return (
          existing !== undefined &&
          !existing.is_linked_to_current_feed &&
          !existing.has_eligible_source
        )
      }))
  const eligibleItemPublicationChanged = upsertedRows.some(row => {
    const existing = existingRowsById.get(row.id)
    return (
      existing?.has_eligible_source === true &&
      existing.published_at.getTime() !== row.published_at.getTime()
    )
  })
  if (eligibleSourceLinked || eligibleItemPublicationChanged) void enqueueRefreshTopHashtags()
}
