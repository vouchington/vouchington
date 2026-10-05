import createHttpError from 'http-errors'
import { getCommentAncestorsByAny } from '@services/comments/ancestors'
import type { QueryOptions } from '@data-stores/psql'
import { getPostsByAnyBatch } from './get-batch.mts'
import { getPostByAny } from './get.mts'
import type { Post } from './types.mts'

/** Load a complete ordered thread and hydrate live rows on the caller's query connection. */
export async function loadPostWriteThread(id: string, options: QueryOptions) {
  const post = await getPostByAny(id, options)
  if (!post) throw createHttpError(404, 'Post not found')
  const nodes =
    post.post_type === 'comment' ? await getCommentAncestorsByAny(post.id, options) : [post]
  if (nodes.at(-1)?.id !== post.id || nodes[0]?.id !== (post.root_post_id ?? post.id))
    throw createHttpError(404, 'Post not found')
  const live = nodes.filter(node => !node.deleted_at)
  const chain = await getPostsByAnyBatch(
    live.map(node => node.id),
    options,
  )
  if (chain.some(node => !node) || !chain.some(node => node?.id === post.id))
    throw createHttpError(404, 'Post not found')
  return { post, nodes, posts: chain.filter((node): node is Post => Boolean(node)) }
}
