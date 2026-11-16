import { isSlug, isUUID } from '@modules/utils'
import { getPostsByAnyBatch } from '@services/posts/get-batch'
import type { Post } from '@services/posts/types'

/**
 * Resolves post id or slug references in one statement. A value that is neither is missing.
 * One bad reference does not reject the rest. Visibility stays with the caller's existing guard.
 */
export async function resolvePosts(references: readonly string[]): Promise<Array<Post | null>> {
  const lookups = references.flatMap((reference, order) => {
    const trimmed = reference.trim()
    if (!trimmed) return []
    return isUUID(trimmed) || isSlug(trimmed.toLowerCase()) ? [{ value: trimmed, order }] : []
  })
  if (lookups.length === 0) return references.map(() => null)
  const posts = await getPostsByAnyBatch(lookups.map(lookup => lookup.value))
  const postsByOrder = new Map(lookups.map(({ order }, index) => [order, posts[index] ?? null]))
  return references.map((_, order) => postsByOrder.get(order) ?? null)
}
