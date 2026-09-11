import { getPostMetricsByAny } from '@services/posts/metrics'
import { getTopicMetricsByAny } from '@services/topics/metrics'
import onError from '@modules/on-error'
import { caches } from '@services/entity-cache/caches'
import { getPostCacheKeys, getTopicCacheKeys } from '@services/entity-cache/keys'

type RefreshFunction = (...keys: unknown[]) => Promise<void>

// user_metrics refresh lives in ./metrics.mts's refreshUserMetricsCache (split there originally
// since @services/entity-cache could not import @services/users/metrics without creating a
// users<->entity-cache cycle; that constraint no longer applies here since @services/entity-fetch
// already depends on both @services/users and @services/entity-cache).
export const refresh = {
  topic_metrics: wrap(async (...keys: unknown[]): Promise<void> => {
    const cacheKeys = await getTopicCacheKeys(...keys)
    if (cacheKeys.length > 0) {
      await caches.topic_metrics.refreshById(cacheKeys, getTopicMetricsByAny)
    }
  }),
  post_metrics: wrap(async (...keys: unknown[]): Promise<void> => {
    const cacheKeys = await getPostCacheKeys(...keys)
    if (cacheKeys.length > 0) {
      await caches.post_metrics.refreshById(cacheKeys, getPostMetricsByAny)
    }
  }),
}

function wrap(fn: RefreshFunction): RefreshFunction {
  return async (...keys: unknown[]): Promise<void> => {
    try {
      return await fn(...keys)
    } catch (error) {
      onError(error as Error)
      throw error
    }
  }
}
