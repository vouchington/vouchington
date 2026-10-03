import contracts from '@voucha/api-fixtures/v1/request-contracts.json' with { type: 'json' }
import createHttpError from 'http-errors'
import { write } from '@data-stores/psql'
import { getCommentAncestorsByAny } from '@services/comments'
import { getPostByAny, type Post } from '@services/posts'
import { canViewPostsBatch } from '@services/posts/check-privacy-access'
import type { PrivateUser } from '@services/users/types'
import { inlineSchemaReferences } from './route-response-schema.mts'
import { mcpPostSchema } from './mcp-post-output.mts'
import { successSchema } from './output-schema-shapes.mts'

export const POST_WRITE_SCOPES = ['posts:read', 'posts:write'] as const
export const POST_WRITE_RESULT_SCHEMA = successSchema({ post: mcpPostSchema() })
export const POST_ID_SCHEMA = {
  type: 'string',
  description: 'The UUID or slug of your post or comment.',
}

/** Reuse the current REST input contract without changing or regenerating REST contracts. */
export function postWriteParameters(
  operation: 'POST:/api/v1/posts' | 'PATCH:/api/v1/posts/:idOrSlug',
) {
  const source = contracts as unknown as {
    components: Record<string, Record<string, unknown>>
    operations: Record<string, { body: Record<string, unknown> }>
  }
  const schema = inlineSchemaReferences(source.operations[operation]!.body, source.components)
  const properties = schema['properties'] as Record<string, Record<string, unknown>>
  const fields = Object.fromEntries(
    Object.entries(properties).filter(
      ([name]) =>
        !['hp_website', 'hp_phone', 'cf_turnstile_response', 'recaptcha_token'].includes(name),
    ),
  )
  if (operation.startsWith('POST:'))
    fields['post_type'] = {
      type: 'string',
      enum: ['discussion', 'review', 'data_point', 'comment', 'link', 'article', 'blog_post'],
    }
  return { ...schema, type: 'object', properties: fields, additionalProperties: false }
}

/** Delegated access covers public threads and only the caller's own private records. */
export async function loadWritablePost(
  user: PrivateUser,
  id: string,
  requireOwnership = true,
): Promise<Post> {
  const post = await getPostByAny(id, { readOnly: false })
  if (
    !post ||
    (requireOwnership && (post.post_type === 'story' || post.post_type === 'topic_recommendation'))
  )
    throw createHttpError(404, 'Post not found')
  if (requireOwnership && post.created_by_id !== user.id) throw createHttpError(403, 'Forbidden')
  const nodes =
    post.post_type === 'comment'
      ? await getCommentAncestorsByAny(post.id, { readOnly: false })
      : [post]
  if (nodes.at(-1)?.id !== post.id || nodes[0]?.id !== (post.root_id ?? post.id))
    throw createHttpError(404, 'Post not found')
  const live = nodes.filter(node => !node.deleted_at)
  const chain = await Promise.all(live.map(node => getPostByAny(node.id, { readOnly: false })))
  if (chain.some(node => !node) || !chain.some(node => node?.id === post.id))
    throw createHttpError(404, 'Post not found')
  const posts = chain.filter((node): node is Post => Boolean(node))
  const [asOwner, asPublic] = await Promise.all([
    canViewPostsBatch(user, posts, { query: write }),
    canViewPostsBatch(null, posts, { query: write }),
  ])
  if (
    !posts.every(
      node => asOwner.get(node.id) && (asPublic.get(node.id) || node.created_by_id === user.id),
    )
  )
    throw createHttpError(404, 'Post not found')
  return post
}
