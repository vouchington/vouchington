import { expireBookmarkBloomFiltersMissingTtl } from '@data-stores/valkey'
import { BOOKMARK_BLOOM_FILTER_TTL_SECONDS } from '@services/bookmarks/bloom-filter-utils'

export { expireOrphanedBloomFilterBuildingKeys } from '@data-stores/valkey'

/**
 * Attach a defensive TTL to any bookmark bloom filter live key left with none by a backfill that
 * died between its atomic RENAME and the separate `Batch` that sets the live key's TTL
 * (`backend/services/bookmarks/bloom-filter.mts`). See
 * `expireBookmarkBloomFiltersMissingTtl` in `@data-stores/valkey` for the implementation.
 */
export async function sweepBookmarkBloomFiltersMissingTtl(): Promise<void> {
  await expireBookmarkBloomFiltersMissingTtl(BOOKMARK_BLOOM_FILTER_TTL_SECONDS)
}
