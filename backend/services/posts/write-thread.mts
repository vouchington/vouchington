import createHttpError from 'http-errors'
import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getPostsByAnyBatch } from './get-batch.mts'
import { getPostByAny } from './get.mts'
import type { Post } from './types.mts'

type PostWriteContext = Pick<Post, 'id' | 'post_type' | 'root_post_id' | 'deleted_at'>

/** Authorize against only the target, its immediate parent, and its stored root. */
export async function loadPostWriteThread(id: string, options: QueryOptions, knownPost?: Post) {
  const post = knownPost?.id === id ? knownPost : await getPostByAny(id, options)
  if (!post) throw createHttpError(404, 'Post not found')
  if (post.post_type !== 'comment') {
    if (post.root_post_id) throw createHttpError(404, 'Post not found')
    return { post, nodes: [post], posts: [post] }
  }
  if (!post.parent_post_id || !post.root_post_id) throw createHttpError(404, 'Post not found')
  const contextIds = [...new Set([post.root_post_id, post.parent_post_id])]
  const { rows: context } = await read<PostWriteContext>(
    sql`/* loadPostWriteThread.context */
      SELECT id, post_type, root_post_id, deleted_at FROM posts
      WHERE id = ANY(${contextIds}::uuid[]) LIMIT 2`,
    options,
  )
  if (context.length !== contextIds.length) throw createHttpError(404, 'Post not found')
  const orderedContext = contextIds.map(contextId => context.find(node => node.id === contextId)!)
  const root = orderedContext[0]!
  const parent = context.find(node => node.id === post.parent_post_id)!
  const parentRootId = parent.post_type === 'comment' ? parent.root_post_id : parent.id
  if (root.post_type === 'comment' || root.root_post_id || parentRootId !== root.id)
    throw createHttpError(404, 'Post not found')
  const liveContext = orderedContext.filter(node => !node.deleted_at)
  const hydrated = await getPostsByAnyBatch(
    liveContext.map(node => node.id),
    options,
  )
  if (hydrated.some(node => !node)) throw createHttpError(404, 'Post not found')
  return {
    post,
    nodes: [...orderedContext, post],
    posts: [...hydrated.filter((node): node is Post => Boolean(node)), post],
  }
}
