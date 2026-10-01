import { isSlug, isUUID } from '@modules/utils'
import { getCommentAncestorsByAny } from '@services/comments'
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
 * reaching the caller through `parent_id`. A deleted post cannot be loaded, so a deleted target
 * is not found and a deleted ancestor is left out of the chain, as in the REST twin.
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
