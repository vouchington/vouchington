import { isSlug, isUUID } from '@modules/utils'
import { getPostsByAnyBatch } from '@services/posts/get-batch'
import type { Post } from '@services/posts/types'

/**
 * Resolves post id or slug references in one statement. A value that is neither is missing.
 * One bad reference does not reject the rest. Visibility stays with the caller's existing guard.
 */
export async function resolvePosts(references: readonly string[]): Promise<Array<Post | null>> {
  const lookups: string[] = []
  const orders: number[] = []
  references.forEach((reference, index) => {
    const trimmed = reference.trim()
    if (!trimmed) return
    if (isUUID(trimmed) || isSlug(trimmed.toLowerCase())) {
      lookups.push(trimmed)
      orders.push(index)
    }
  })
  const results: Array<Post | null> = references.map(() => null)
  if (lookups.length === 0) return results
  const posts = await getPostsByAnyBatch(lookups)
  posts.forEach((post, index) => {
    const order = orders[index]
    if (order !== undefined) results[order] = post ?? null
  })
  return results
}

export async function resolvePost(reference: string): Promise<Post | null> {
  const [post] = await resolvePosts([reference])
  return post ?? null
}
