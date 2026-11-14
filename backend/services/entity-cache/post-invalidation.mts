import { ValkeyCache } from '@data-stores/valkey/cache'
import { caches } from './caches.mts'
import { getCacheKeys, getPostCacheKeys } from './keys.mts'

type DeleteCacheGroups = (
  groups: Parameters<typeof ValkeyCache.deleteFromCaches>[0],
) => Promise<void>

/** Bind the canonical bounded deletion operation; each invocation owns its reporting state. */
export function createPostCacheInvalidator(deleteCacheGroups: DeleteCacheGroups) {
  return (...keys: unknown[]): Promise<void> => invalidateKeys(keys)

  async function invalidateKeys(keys: unknown[]): Promise<void> {
    // Keep both UUIDs and slugs, but only slugs enter the posts_lookup cache.
    // Input slugs remain invalidatable even when their post no longer exists.
    const postKeys = await getPostCacheKeys(...keys)
    await deleteKeys(postKeys)
  }

  async function deleteKeys(postKeys: Awaited<ReturnType<typeof getPostCacheKeys>>): Promise<void> {
    await deleteCacheGroups([
      { cache: caches.posts, keys: postKeys },
      { cache: caches.posts_lookup, keys: [...getCacheKeys(postKeys).slugs] },
    ])
  }
}
