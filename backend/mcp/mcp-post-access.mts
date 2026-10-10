import { isSlug, isUUID } from '@modules/utils'
import { getCommentAncestorsBatch, getCommentAncestorsByAny } from '@services/comments'
import { getPostByAnyCached, getPostByAnyCachedBatch } from '@services/entity-fetch'
import type { Post } from '@services/posts'
import { BLOCKED_POST_TYPES, canViewPostsBatch } from '@services/posts/check-privacy-access'
import type { BasicUser } from '@services/users/types'
import { requirePrivateToolUser } from './private-user.mts'

export type ReadableThread = {
  /** The requested post. */
  post: Post
  /** Its live parent chain, root first and without `post`. */
  ancestors: Post[]
}

/**
 * Resolves the post an MCP caller may read, or null when it answers as not found.
 *
 * MCP is "parity minus private data". A post is readable only when the shared direct-read policy
 * (`canViewPostsBatch`, the policy behind the REST routes) accepts every comment from the thread
 * root down to it, both as the credential owner and as a signed-out reader. Every rule in that
 * policy only ever adds access for a signed-in viewer (the author, audience members, community
 * members, staff), so the signed-out answer is exactly the owner's answer minus what is visible
 * through private visibility: a private post, a private share or community membership, and the
 * author's own not-yet-cleared posts all answer as not found, even to their author.
 *
 * Demanding the whole chain, not only the post and its root, keeps a hidden ancestor from
 * reaching the caller through `parent_post_id`. A deleted post cannot be loaded, so a deleted target
 * is not found and a deleted ancestor is left out of the chain, as in the REST twin.
 *
 * `search_posts` applies this same rule to its results in SQL (`public_eligibility_only` in
 * backend/services/posts/search/query-builder/base-filters.mts, plus `thread-readability.mts` for
 * comment chains), because a chain predicate cannot run per row. Discovery is stricter (public
 * audience, unarchived, unsuspended, no community), so a search result is always readable here but
 * not the reverse. Change the rule in both places; the search agreement test compares them.
 */
export async function resolveReadableThread(
  currentUser: BasicUser,
  idOrSlug: string,
): Promise<ReadableThread | null> {
  if (!isUUID(idOrSlug) && !isSlug(idOrSlug)) return null
  const post = await getPostByAnyCached(idOrSlug)
  if (!post) return null

  const chain = post.post_type === 'comment' ? await loadCommentChain(post) : [post]
  if (!chain || chain.some(node => BLOCKED_POST_TYPES.has(node.post_type))) return null

  const privateUser = await requirePrivateToolUser(currentUser)
  const [asOwner, asSignedOut] = await Promise.all([
    canViewPostsBatch(privateUser, chain),
    canViewPostsBatch(null, chain),
  ])
  if (!chain.every(node => asOwner.get(node.id) && asSignedOut.get(node.id))) return null
  return { post, ancestors: chain.slice(0, -1) }
}

/** The live thread root down to `post`, inclusive, or null when a member cannot be loaded. */
async function loadCommentChain(post: Post): Promise<Post[] | null> {
  const nodes = (await getCommentAncestorsByAny(post.id)).filter(node => !node.deleted_at)
  const posts = await getPostByAnyCachedBatch(nodes.map(node => node.id))
  const chain = posts.filter((node): node is Post => Boolean(node))
  if (chain.length !== nodes.length || chain.at(-1)?.id !== post.id) return null
  return chain
}

const live = (node: { deleted_at: Date | null }) => !node.deleted_at

/**
 * Resolves many posts at once with exactly the visibility `resolveReadableThread` gives each one,
 * in the order of `postIds`: the thread, or null where it answers as not found. A page costs one
 * ancestors query, one cached post read, one `requirePrivateToolUser` and one `canViewPostsBatch`
 * pair over the union of the thread chains, however many posts it holds. Takes post ids only; an
 * entry that is not a UUID is not found.
 */
export async function resolveReadableThreads(
  currentUser: BasicUser,
  postIds: string[],
): Promise<(ReadableThread | null)[]> {
  const ids = [...new Set(postIds.filter(isUUID))]
  const nodesById = await getCommentAncestorsBatch(ids)
  const chainIds = [
    ...new Set(
      [...nodesById.values()]
        .flat()
        .filter(live)
        .map(node => node.id),
    ),
  ]
  const loaded = new Map(
    (await getPostByAnyCachedBatch(chainIds)).flatMap(post => (post ? [[post.id, post]] : [])),
  )

  const chains = new Map<string, Post[]>()
  for (const id of ids) {
    const nodes = (nodesById.get(id) ?? []).filter(live)
    const chain = nodes.flatMap(node => loaded.get(node.id) ?? [])
    const intact = chain.length === nodes.length && chain.at(-1)?.id === id
    if (intact && !chain.some(node => BLOCKED_POST_TYPES.has(node.post_type))) chains.set(id, chain)
  }
  const readable = new Set<string>()
  if (chains.size > 0) {
    const privateUser = await requirePrivateToolUser(currentUser)
    const union = [...new Map([...chains.values()].flat().map(node => [node.id, node])).values()]
    const [asOwner, asSignedOut] = await Promise.all([
      canViewPostsBatch(privateUser, union),
      canViewPostsBatch(null, union),
    ])
    for (const [id, chain] of chains) {
      if (chain.every(node => asOwner.get(node.id) && asSignedOut.get(node.id))) readable.add(id)
    }
  }
  return postIds.map(id => {
    const chain = readable.has(id) ? chains.get(id) : undefined
    return chain ? { post: chain.at(-1) as Post, ancestors: chain.slice(0, -1) } : null
  })
}
