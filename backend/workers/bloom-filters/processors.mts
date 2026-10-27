import { rebuildBloomFilter, rebuildEmailBloomFilter } from '@services/urls-domains-blacklist'
import { rebuildApiKeyBloomFilter } from '@services/api-keys/bloom-filter'
import { rebuildEmbeddingBloomFilter } from '@services/bedrock-embeddings/bloom-filter/population'
import { backfillBloomFilter } from '@services/entity-cache/backfill-bloom-filter'
import {
  backfillUserBookmarkBloomFilter,
  deleteUserBookmarkBloomFilter,
} from '@services/bookmarks/bloom-filter'
import type {
  RebuildBloomFilterData,
  BackfillBloomFilterData,
  BackfillUserBookmarkBloomFilterData,
  DeleteUserBookmarkBloomFilterData,
  RebuildEmbeddingBloomFilterData,
} from '@queues/bloom-filters/types'

export type RebuildBloomFilterProcessorOptions = {
  afterSnapshot?: () => Promise<void>
}

const noopAfterSnapshot = async (): Promise<void> => {}

export async function processRebuildBloomFilter(
  data: RebuildBloomFilterData,
  options: RebuildBloomFilterProcessorOptions = {},
): Promise<void> {
  const afterSnapshot = options.afterSnapshot ?? noopAfterSnapshot
  if (data.filter === 'url-blocklist') {
    await rebuildBloomFilter({ afterSnapshot })
  } else if (data.filter === 'email-blocklist') {
    await rebuildEmailBloomFilter({ afterSnapshot })
  } else if (data.filter === 'embedding') {
    await rebuildEmbeddingBloomFilter()
  } else if (data.filter === 'api-keys') {
    await rebuildApiKeyBloomFilter()
  }
}

export async function processBackfillBloomFilter(data: BackfillBloomFilterData): Promise<void> {
  await backfillBloomFilter(data.entityType)
}

export async function processBackfillUserBookmarkBloomFilter(
  data: BackfillUserBookmarkBloomFilterData,
): Promise<void> {
  await backfillUserBookmarkBloomFilter(data.userId)
}

export async function processDeleteUserBookmarkBloomFilter(
  data: DeleteUserBookmarkBloomFilterData,
): Promise<void> {
  await deleteUserBookmarkBloomFilter(data.userId)
}

export async function processRebuildEmbeddingBloomFilter(
  _data: RebuildEmbeddingBloomFilterData,
): Promise<void> {
  await rebuildEmbeddingBloomFilter()
}
