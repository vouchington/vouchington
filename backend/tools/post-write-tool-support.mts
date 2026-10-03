import contracts from '@voucha/api-fixtures/v1/request-contracts.json' with { type: 'json' }
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
        !['hp_website', 'hp_phone', 'cf_turnstile_response', 'recaptcha_token'].includes(name) &&
        !(operation.startsWith('POST:') && name === 'root_id') &&
        !(
          operation.startsWith('PATCH:') &&
          ['images', 'post_type', 'parent_id', 'root_id', 'community_id', 'url', 'url_id'].includes(
            name,
          )
        ),
    ),
  )
  if (operation.startsWith('POST:'))
    fields['post_type'] = {
      type: 'string',
      enum: ['discussion', 'review', 'data_point', 'comment', 'link', 'article', 'blog_post'],
    }
  return { ...schema, type: 'object', properties: fields, additionalProperties: false }
}

export { loadWritablePost } from '@services/posts/authorization'
