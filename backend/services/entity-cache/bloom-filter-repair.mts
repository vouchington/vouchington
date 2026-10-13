import { bloomValkeyClient } from '@data-stores/valkey'
import { enqueueBackfillBloomFilter } from '@queues/bloom-filters/enqueues'
import onError from '@modules/on-error'
import { entityCacheBloomFilters } from './bloom-filter-instances.mts'

export type EntityBloomFilterType = keyof typeof entityCacheBloomFilters
export type EntityBloomRepairTarget = {
  filter: Pick<(typeof entityCacheBloomFilters)['posts'], 'addOrThrow' | 'mexistsIfReady'>
  readyKey: string
  enqueueRebuild: () => Promise<unknown>
}

function entityBloomRepairTarget(entityType: EntityBloomFilterType): EntityBloomRepairTarget {
  return {
    filter: entityCacheBloomFilters[entityType],
    readyKey: entityBloomReadyKey(entityType),
    enqueueRebuild: () => repairMissingEntityBloomFilter(entityType),
  }
}

export function entityBloomReadyKey(entityType: EntityBloomFilterType): string {
  return `bloom-filter:${entityType}:ready`
}

export async function repairMissingEntityBloomFilter(
  entityType: EntityBloomFilterType,
): Promise<void> {
  await enqueueBackfillBloomFilter({ entityType })
}

export async function addEntityBloomKeys(
  entityType: EntityBloomFilterType,
  keys: string[],
  target = entityBloomRepairTarget(entityType),
): Promise<void> {
  try {
    await target.filter.addOrThrow(keys)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    try {
      const removed = await bloomValkeyClient.unlink([target.readyKey])
      if (removed > 0) await target.enqueueRebuild()
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
}

export async function checkEntityBloomKeys(
  entityType: EntityBloomFilterType,
  keys: string[],
  target = entityBloomRepairTarget(entityType),
): Promise<(boolean | null)[]> {
  try {
    const results = await target.filter.mexistsIfReady(target.readyKey, keys)
    if (results.some(result => result === null)) await target.enqueueRebuild()
    return results
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return keys.map(() => null)
  }
}
