import createHttpError from 'http-errors'
import { getCommentAncestorsByAny } from '@services/comments/ancestors'
import { getPostByAny } from './get.mts'
import type { Post } from './types.mts'
import { canViewPostsBatch } from './check-privacy-access.mts'
import type { PrivateUser } from '@services/users/types'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import { runSequentially } from '@modules/utils/run-sequentially'
import sql from 'sql-template-strings'

/** Delegated access covers public threads and only the caller's own private records. */
export async function loadWritablePost(
  user: PrivateUser,
  id: string,
  requireOwnership = true,
  options: QueryOptions = { readOnly: false },
): Promise<Post> {
  const post = await getPostByAny(id, options)
  if (
    !post ||
    (requireOwnership && (post.post_type === 'story' || post.post_type === 'topic_recommendation'))
  )
    throw createHttpError(404, 'Post not found')
  const nodes =
    post.post_type === 'comment' ? await getCommentAncestorsByAny(post.id, options) : [post]
  if (nodes.at(-1)?.id !== post.id || nodes[0]?.id !== (post.root_id ?? post.id))
    throw createHttpError(404, 'Post not found')
  if (nodes.some(node => node.post_type === 'topic_recommendation'))
    throw createHttpError(404, 'Post not found')
  const live = nodes.filter(node => !node.deleted_at)
  const chain = await Promise.all(live.map(node => getPostByAny(node.id, options)))
  if (chain.some(node => !node) || !chain.some(node => node?.id === post.id))
    throw createHttpError(404, 'Post not found')
  const posts = chain.filter((node): node is Post => Boolean(node))
  const [asOwner, asPublic] = await Promise.all([
    canViewPostsBatch(user, posts, options),
    canViewPostsBatch(null, posts, options),
  ])
  if (
    !posts.every(
      node => asOwner.get(node.id) && (asPublic.get(node.id) || node.created_by_id === user.id),
    )
  )
    throw createHttpError(404, 'Post not found')
  if (requireOwnership && post.created_by_id !== user.id) throw createHttpError(403, 'Forbidden')
  return post
}

/** Lock the same publication and thread fences as privacy edits/deletion and thread locking. */
export async function lockDelegatedPostThread(
  query: TransactionQuery,
  postId: string,
): Promise<void> {
  const post = await getPostByAny(postId, { query })
  if (!post) throw createHttpError(404, 'Post not found')
  const nodes =
    post.post_type === 'comment' ? await getCommentAncestorsByAny(postId, { query }) : [post]
  if (nodes.at(-1)?.id !== post.id || nodes[0]?.id !== (post.root_id ?? post.id))
    throw createHttpError(404, 'Post not found')
  const ids = nodes.map(node => node.id).toSorted()
  await runSequentially([
    () => lockPostPublicationPostScopes(query, ids),
    () =>
      query(sql`/* lockDelegatedPostThread */
      SELECT pg_advisory_xact_lock(hashtextextended(id::text, 0))
      FROM unnest(${ids}::uuid[]) AS input(id) ORDER BY id`),
    () =>
      query(sql`/* lockDelegatedPostThread.rows */
      SELECT id FROM posts WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`),
  ])
}
