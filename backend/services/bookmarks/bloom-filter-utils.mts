import { normalizeKey } from '@ts-shared/utils/strings'
import {
  entityRelationMetadatum,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { ValkeyBloomFilter, bloomValkeyClient } from '@data-stores/valkey'

// Measured empirically against a local valkey-bloom instance (BF.RESERVE/BF.INFO/MEMORY USAGE):
// at capacity 10_000 a fresh filter costs ~12.3KB; at 2_500 it costs ~3.3KB (73% less) and a
// simulated 2,000-item power user (bookmarks span 11 predicates sharing one per-user filter)
// still fits in a single sub-filter with zero BF.MADD-triggered scale-out. 1_000 was rejected:
// exceeding it forces a second sub-filter, nearly tripling memory and doubling lookup cost.
export const BOOKMARK_BLOOM_DEFAULT_CAPACITY = 2_500
export const BOOKMARK_BLOOM_ERROR_RATE = 0.01
export const BOOKMARK_BLOOM_BATCH_SIZE = 5_000

// Ready markers signal per-relation backfill completion; they refresh on every successful
// backfill, so a 7-day TTL only matters if backfills stop entirely for a user.
export const BOOKMARK_BLOOM_READY_TTL_SECONDS = 7 * 24 * 60 * 60
// The live filter key's TTL is not safety-critical relative to the ready-key TTL: the Lua
// check (check-bloom-candidates.lua) gates every read on `EXISTS(filterKey)`, so an expired
// filter key always degrades to `ready: false` (PostgreSQL fallback) with zero false
// negatives, regardless of ready-key state. This TTL exists only to bound leaked memory on
// the shared noeviction Valkey instance if a user's filter stops being refreshed (e.g. the
// user is deleted and processDeleteUserBookmarkBloomFilter is lost).
export const BOOKMARK_BLOOM_FILTER_TTL_SECONDS = 8 * 24 * 60 * 60

export function getUserBookmarkRelationByTableNameOrThrow(
  relationTableName: string,
): EntityRelationMetadata {
  const relation = entityRelationMetadatum.find(
    relationData =>
      relationData.subject_type === 'user' &&
      relationData.is_bookmark &&
      relationData.table_name === relationTableName,
  )
  if (relation) return relation

  throw new Error(`Unknown user bookmark relation table: ${relationTableName}`)
}

export function normalizeBookmarkObjectIds(objectIds: string[]): string[] {
  return objectIds.map(objectId => normalizeKey(objectId))
}

export function getBookmarkBloomFilterName(userId: string): string {
  return `user-bookmarks:${userId}`
}

export function getBookmarkBloomFilter(userId: string): ValkeyBloomFilter {
  return new ValkeyBloomFilter({
    name: getBookmarkBloomFilterName(userId),
    capacity: BOOKMARK_BLOOM_DEFAULT_CAPACITY,
    errorRate: BOOKMARK_BLOOM_ERROR_RATE,
    batchSize: BOOKMARK_BLOOM_BATCH_SIZE,
    client: bloomValkeyClient,
  })
}

export function getBookmarkBloomReadyKey(userId: string, tableName: string): string {
  return `bookmark-bloom-ready:${userId}:${tableName}`
}
