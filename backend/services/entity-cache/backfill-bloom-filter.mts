import { enqueueBackfillBloomFilter } from '@queues/bloom-filters/enqueues'
import onError from '@modules/on-error'
import { entityCacheBloomFilters } from './bloom-filter-instances.mts'
import {
  backfillPostsBloomFilter,
  backfillTopicsBloomFilter,
  backfillUsersBloomFilter,
  backfillCommunitiesBloomFilter,
  backfillRssFeedItemsBloomFilter,
} from './backfill-entity-filters.mts'

export {
  entityCacheBloomFilters,
  entityCacheBloomFilterEnabled,
} from './bloom-filter-instances.mts'

export async function warmUpEntityCacheBloomFilters(): Promise<void> {
  const entityTypes = Object.keys(entityCacheBloomFilters) as Array<
    keyof typeof entityCacheBloomFilters
  >
  const missingEntityTypes = (
    await Promise.allSettled(
      entityTypes.map(async entityType => {
        try {
          return {
            entityType,
            exists: await entityCacheBloomFilters[entityType].keyExists(),
          }
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)))
          return { entityType, exists: false }
        }
      }),
    )
  ).flatMap(result =>
    result.status === 'fulfilled' && !result.value.exists ? [result.value.entityType] : [],
  )

  await Promise.all(
    missingEntityTypes.map(async entityType => {
      try {
        await enqueueBackfillBloomFilter({ entityType })
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    }),
  )
}

export async function backfillBloomFilter(
  entityType: 'posts' | 'topics' | 'users' | 'communities' | 'rss_feed_items',
): Promise<void> {
  switch (entityType) {
    case 'posts':
      await backfillPostsBloomFilter()
      break
    case 'topics':
      await backfillTopicsBloomFilter()
      break
    case 'users':
      await backfillUsersBloomFilter()
      break
    case 'communities':
      await backfillCommunitiesBloomFilter()
      break
    case 'rss_feed_items':
      await backfillRssFeedItemsBloomFilter()
      break
  }
}
