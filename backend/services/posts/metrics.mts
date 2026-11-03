import type { QueryOptions } from '@data-stores/psql/types'
import { getPostMetricsByAnyBatch } from './metrics-batch.mts'
import type { PostMetrics } from './types.mts'

export const getPostMetricsByAny = async (
  idOrSlug: string,
  options: QueryOptions = {},
): Promise<PostMetrics | null> => {
  const [metrics] = await getPostMetricsByAnyBatch([idOrSlug], options)
  return metrics ?? null
}
