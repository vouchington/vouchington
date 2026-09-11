import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isSlug, isUUID } from '@modules/utils'
import {
  buildOrderedInputCtes,
  normalizeBatchIdentifiers,
  partitionBatchIdentifiers,
  scatterOrderedRows,
} from '@services/batch-lookup'
import createError from 'http-errors'
import { buildTopicMetricsBatchQuery } from './metrics-batch-query.mts'
import type { TopicMetrics } from './types.mts'

export const getTopicMetricsByAnyBatch = async (
  idsOrSlugs: string[],
  options: QueryOptions = {},
): Promise<Array<TopicMetrics | null | undefined>> => {
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
  const { rows } = await read(
    buildTopicMetricsBatchQuery(inputCtes.ctes),
    inputCtes.values,
    options,
  )

  return scatterOrderedRows(idsOrSlugs.length, rows, row => {
    const { input_order: _inputOrder, ...metrics } = row
    return {
      __entity_type: 'topic_metrics',
      id: metrics.id,
      count: {
        discussions: Number(metrics.count__discussions) || 0,
        reviews: Number(metrics.count__reviews) || 0,
        'data-points': Number(metrics.count__data_points) || 0,
        news: Number(metrics.count__news) || 0,
        latest: Number(metrics.count__latest) || 0,
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
