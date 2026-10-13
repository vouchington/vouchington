import { ValkeyCache } from '@data-stores/valkey/cache'
import { enqueueBulkPurgeCacheTags } from '@queues/cache-purge/enqueues'
import { postTag } from '@ts-shared/cache'
import { caches } from './caches.mts'
import { getCacheKeys, getPostCacheKeys } from './keys.mts'

export type PostCacheInvalidation = {
  completion: Promise<void>
  rejectionReported: boolean
}

type DeleteCacheGroups = (
  groups: Parameters<typeof ValkeyCache.deleteFromCaches>[0],
) => Promise<void>

/** Bind the canonical bounded deletion operation; each invocation owns its reporting state. */
export function createPostCacheInvalidator(deleteCacheGroups: DeleteCacheGroups) {
  return (...keys: unknown[]): PostCacheInvalidation => {
    const operation: PostCacheInvalidation = {
      completion: Promise.resolve(),
      rejectionReported: false,
    }
    operation.completion = invalidateKeys(operation, keys)
    return operation
  }

  async function invalidateKeys(operation: PostCacheInvalidation, keys: unknown[]): Promise<void> {
    // Keep both UUIDs and slugs, but only slugs enter the posts_lookup cache.
    // Input slugs remain invalidatable even when their post no longer exists.
    const postKeys = await getPostCacheKeys(...keys)
    await deleteAndPurge(operation, postKeys)
  }

  async function deleteAndPurge(
    operation: PostCacheInvalidation,
    postKeys: Awaited<ReturnType<typeof getPostCacheKeys>>,
  ): Promise<void> {
    await deleteCacheGroups([
      { cache: caches.posts, keys: postKeys },
      { cache: caches.posts_lookup, keys: [...getCacheKeys(postKeys).slugs] },
    ])
    // A returned factory promise owns its rejection. A synchronous throw never reaches finally.
    await enqueueBulkPurgeCacheTags(postKeys.map(postTag)).finally(() => {
      operation.rejectionReported = true
    })
  }
}
