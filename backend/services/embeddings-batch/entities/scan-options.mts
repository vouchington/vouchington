import { getMinUUIDv7ForDate } from '@modules/utils'
import { getPendingEmbeddingScanLimits } from '@services/embeddings/batch/config'
import type { EmbeddingScanCursor } from '@queues/gemini-embeddings-batch/types'

export type PendingScanOptions = {
  /** Optional ownership scope for image scan callers. */
  imageIds?: readonly string[]
  cursor?: EmbeddingScanCursor
  limits?: ReturnType<typeof getPendingEmbeddingScanLimits>
  onComplete?: (result: { hasMore: boolean; cursor?: EmbeddingScanCursor }) => void
}

export function createPendingScan(options: PendingScanOptions, images = false) {
  const limits = options.limits ?? getPendingEmbeddingScanLimits(images)
  const sweepStartedAt = options.cursor?.sweepStartedAt ?? new Date().toISOString()
  return {
    upperId: getMinUUIDv7ForDate(new Date(sweepStartedAt)),
    afterId: options.cursor?.afterId ?? null,
    limits,
    complete: (result: {
      hasMore: boolean
      lastRow?: { id?: string; crawl_id?: string; order_index?: number }
    }) =>
      options.onComplete?.({
        hasMore: result.hasMore,
        ...(result.lastRow
          ? {
              cursor: {
                sweepStartedAt,
                afterId: result.lastRow.id ?? result.lastRow.crawl_id,
                ...(result.lastRow.order_index !== undefined
                  ? { afterOrderIndex: result.lastRow.order_index }
                  : {}),
              },
            }
          : {}),
      }),
  }
}
