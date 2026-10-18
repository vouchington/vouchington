import { caches } from '@services/entity-cache/caches'
import { getPostsByAnyBatch } from '@services/posts/get-batch'
import { getPostsWithRootsByAnyBatch } from '@services/posts/get-with-roots-batch'
import type { Post } from '@services/posts/types'

/** Keep individual post cache entries and their refresh/invalidation behavior intact. */
export async function getPostsWithRootsByAnyCached(postIds: string[]) {
  // The cache miss callback does not expose partial hits. Discover their root IDs in one
  // cache read so mixed hit/miss requests can include all roots in the SQL miss batch.
  let discoveryFailed = false
  const discovered = await caches.posts.getBatch(postIds).catch(() => {
    discoveryFailed = true
    return []
  })
  const knownRootIds = discovered.flatMap(value =>
    value &&
    typeof value === 'object' &&
    'root_post_id' in value &&
    typeof value.root_post_id === 'string'
      ? [value.root_post_id]
      : [],
  )
  let loaded = new Map<string, Post | null>()
  let collecting = true
  const pendingIds = new Set<string>()
  let loading: Promise<Map<string, Post | null>> | undefined
  const getPosts = caches.posts.cacheGetByAnyBatch<Post>(async misses => {
    // Refresh-ahead tasks after this invocation use their own current database snapshot.
    if (!collecting) return getPostsByAnyBatch(misses)
    for (const id of misses) pendingIds.add(id)
    // The cache registers refresh-ahead and foreground misses in the same turn.
    // Let both register before issuing one database batch.
    loading ??= Promise.resolve().then(async () => {
      collecting = false
      loaded = await getPostsWithRootsByAnyBatch(
        discoveryFailed ? postIds : [...pendingIds],
        knownRootIds,
      )
      return loaded
    })
    const rows = await loading
    return misses.map(id => rows.get(id.trim().toLowerCase()) ?? null)
  })
  const posts = await getPosts(postIds)
  collecting = false
  const requestedIds = new Set([
    ...postIds.map(id => id.trim().toLowerCase()),
    ...posts.flatMap(post => (post ? [post.id] : [])),
  ])
  const rootIds = [
    ...new Set(posts.flatMap(post => (post?.root_post_id ? [post.root_post_id] : []))),
  ].filter(id => !requestedIds.has(id))
  const getRoots = caches.posts.cacheGetByAnyBatch<Post>(async misses => {
    await loading
    const unknownIds = misses.filter(id => !loaded.has(id))
    // A cached post's root may change between discovery and the authoritative cache read.
    // Only that newly discovered root needs a fresh fallback lookup.
    const fresh = await getPostsByAnyBatch(unknownIds)
    const roots = new Map(unknownIds.map((id, index) => [id, fresh[index]]))
    return misses.map(id => (loaded.has(id) ? loaded.get(id)! : (roots.get(id) ?? null)))
  })
  const roots = await getRoots(rootIds)
  // Retained cache refresh callbacks must not reuse this request's database snapshot.
  loaded = new Map()
  return { posts, roots }
}
