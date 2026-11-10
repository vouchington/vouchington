import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isSlug, isUUID } from '@modules/utils'
import {
  buildOrderedInputCtes,
  normalizeBatchIdentifiers,
  partitionBatchIdentifiers,
  scatterOrderedRows,
} from '@services/batch-lookup'
import {
  getProfileCountCap,
  profileCountProbeLimit,
  toCappedCount,
} from '@services/users/profile-count-cap'
import createError from 'http-errors'
import { buildTopicMetricsBatchQuery } from './metrics-batch-query.mts'
import type { TopicMetrics } from './types.mts'

type TopicMetricsBatchRow = {
  id: string
  input_order: number
  count__discussions: string
  count__reviews: string
  count__data_points: string
  count__news: string
  count__latest: string
  ratings__count__1: number | null
  ratings__count__2: number | null
  ratings__count__3: number | null
  ratings__count__4: number | null
  ratings__count__5: number | null
  ratings__updated_at: Date | null
  bookmarks__follow_count: number | null
  bookmarks__updated_at: Date | null
}

export const getTopicMetricsByAnyBatch = async (
  idsOrSlugs: string[],
  options: QueryOptions = {},
): Promise<Array<TopicMetrics | null>> => {
  if (idsOrSlugs.length === 0) return []

  const normalizedInputs = normalizeBatchIdentifiers(idsOrSlugs, input => {
    const trimmed = input.trim()
    const normalized = trimmed.toLowerCase()
    if (isUUID(trimmed)) return { value: trimmed, type: 'id' }
    if (isSlug(normalized)) return { value: normalized, type: 'slug' }
    throw createError(422, `Invalid topic identifier: ${input}`)
  })
  const partitions = partitionBatchIdentifiers(normalizedInputs)
  const inputCtes = buildOrderedInputCtes([
    { cteName: 'input_data', sqlType: 'uuid', inputs: partitions.get('id') ?? [] },
    { cteName: 'slug_input_data', sqlType: 'text', inputs: partitions.get('slug') ?? [] },
  ])
  const cap = getProfileCountCap()
  const probeParam = `$${inputCtes.values.length + 1}`
  const { rows } = await read<TopicMetricsBatchRow>(
    `/* getTopicMetricsByAnyBatch */
    WITH ${buildTopicMetricsBatchQuery(inputCtes.ctes, probeParam)}`,
    [...inputCtes.values, profileCountProbeLimit(cap)],
    options,
  )

  return scatterOrderedRows(idsOrSlugs.length, rows, row => {
    const { input_order: _inputOrder, ...metrics } = row
    const discussions = toCappedCount(metrics.count__discussions, cap)
    const reviews = toCappedCount(metrics.count__reviews, cap)
    const dataPoints = toCappedCount(metrics.count__data_points, cap)
    const news = toCappedCount(metrics.count__news, cap)
    const latest = toCappedCount(metrics.count__latest, cap)
    return {
      __entity_type: 'topic_metrics',
      id: metrics.id,
      count: {
        discussions: discussions.count,
        reviews: reviews.count,
        'data-points': dataPoints.count,
        news: news.count,
        latest: latest.count,
      },
      count_capped: {
        discussions: discussions.capped,
        reviews: reviews.capped,
        'data-points': dataPoints.capped,
        news: news.capped,
        latest: latest.capped,
      },
      ratings: {
        count: {
          '1': Number(metrics.ratings__count__1) || 0,
          '2': Number(metrics.ratings__count__2) || 0,
          '3': Number(metrics.ratings__count__3) || 0,
          '4': Number(metrics.ratings__count__4) || 0,
          '5': Number(metrics.ratings__count__5) || 0,
        },
      },
      ratings__updated_at: metrics.ratings__updated_at,
      bookmarks: { follow: Number(metrics.bookmarks__follow_count) || 0 },
      bookmarks__updated_at: metrics.bookmarks__updated_at,
    }
  })
}
