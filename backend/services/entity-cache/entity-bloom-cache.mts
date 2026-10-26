import { ValkeyCache } from '@data-stores/valkey/cache'
import { entityCacheBloomFilterEnabled } from './bloom-filter-instances.mts'
import {
  checkEntityBloomKeys,
  type EntityBloomRepairTarget,
  type EntityBloomFilterType,
} from './bloom-filter-repair.mts'

type EntityCacheEntry = {
  value: string | Buffer | Record<string, unknown> | null
  ttlSecondsRemaining: number | null
  bloomMiss: boolean
}

// The entity cache uses completeness markers; the primitive cache's inline Bloom lookup does not.
// Apply the application's ready-guarded lookups after the ordinary cache read.
export class EntityBloomCache extends ValkeyCache {
  private readonly entityType: EntityBloomFilterType
  private readonly dependencies: { enabled: () => boolean; target?: EntityBloomRepairTarget }

  constructor(
    entityType: EntityBloomFilterType,
    options: ConstructorParameters<typeof ValkeyCache<string>>[0],
    dependencies: { enabled: () => boolean; target?: EntityBloomRepairTarget } = {
      enabled: entityCacheBloomFilterEnabled,
    },
  ) {
    super(options)
    this.entityType = entityType
    this.dependencies = dependencies
  }

  protected override async getValueWithTtl(serializedKey: string): Promise<EntityCacheEntry> {
    const entry = await super.getValueWithTtl(serializedKey)
    if (entry.value !== null || !this.dependencies.enabled()) return entry
    const [exists] = await checkEntityBloomKeys(
      this.entityType,
      [serializedKey],
      this.dependencies.target,
    )
    return { ...entry, bloomMiss: exists === false }
  }

  protected override async getValuesWithTtl(serializedKeys: string[]): Promise<EntityCacheEntry[]> {
    const entries = await super.getValuesWithTtl(serializedKeys)
    if (!this.dependencies.enabled()) return entries
    const misses = serializedKeys.filter((_, index) => entries[index]?.value === null)
    if (misses.length === 0) return entries
    const results = await checkEntityBloomKeys(this.entityType, misses, this.dependencies.target)
    const membership = new Map(misses.map((key, index) => [key, results[index]]))
    return entries.map((entry, index) => ({
      ...entry,
      bloomMiss: entry.value === null && membership.get(serializedKeys[index]!) === false,
    }))
  }
}
