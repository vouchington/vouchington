import { documentedResponseProperty } from '@voucha/test-helpers/openapi-documented-response'
import { describe, expect, it } from 'vitest'
import searchPostsTool from '../search-posts.mts'
import searchTopicsTool from '../search-topics.mts'

type JsonSchema = Record<string, unknown>

const properties = (schema: unknown): Record<string, unknown> =>
  (schema as JsonSchema)['properties'] as Record<string, unknown>

// Each search tool's output is a success variant or the Invalid cursor failure variant.
const variants = (tool: { meta?: { outputSchema?: unknown } }): JsonSchema[] => {
  const schema = tool.meta?.outputSchema as { oneOf: JsonSchema[] }
  return schema.oneOf
}

// GET /api/v1/posts documents each field as a one-member anyOf; the tool states the member itself.
const documentedPostsField = (field: string): JsonSchema =>
  (documentedResponseProperty('get', '/api/v1/posts', '200', field) as { anyOf: JsonSchema[] })
    .anyOf[0]!

// Neither search tool returns its REST twin's body (post ids plus hydration maps, and an undocumented
// topic body), so each owns its output schema. The fields the document does describe stay pinned.
describe('search tool output schemas stay pinned to the documented REST twin', () => {
  it.each([
    ['search_posts', searchPostsTool],
    ['search_topics', searchTopicsTool],
  ])('%s takes page_info from the PageInfo component GET /api/v1/posts documents', (_, tool) => {
    expect(properties(variants(tool)[0])['page_info']).toEqual(documentedPostsField('page_info'))
  })

  it.each([
    ['search_posts', searchPostsTool],
    ['search_topics', searchTopicsTool],
  ])('%s admits the Invalid cursor failure next to its success result', (_, tool) => {
    expect(variants(tool)).toHaveLength(2)
    expect(properties(variants(tool)[0])['success']).toEqual({ const: true })
    expect(variants(tool)[1]).toEqual({
      type: 'object',
      properties: { success: { const: false }, error: { type: 'string' } },
      required: ['success', 'error'],
      additionalProperties: false,
    })
  })

  it('search_posts takes the post id and post_type from the documented result item', () => {
    const documentedItem = properties(
      (documentedPostsField('results') as { items: JsonSchema }).items,
    )
    const results = properties(variants(searchPostsTool)[0])['results'] as {
      items: JsonSchema
    }
    const item = properties(results.items)

    expect(item['id']).toEqual(documentedItem['id'])
    expect(item['post_type']).toEqual(documentedItem['post_type'])
  })

  it('search_posts and search_topics share the REST limit and cursor argument names', () => {
    for (const tool of [searchPostsTool, searchTopicsTool]) {
      const parameters = properties(tool.schema.parameters)

      expect(parameters['limit']).toMatchObject({ type: 'integer', minimum: 1 })
      expect(parameters['limit']).not.toHaveProperty('maximum')
      expect(Object.keys(parameters)).toEqual(
        expect.arrayContaining(['q', 'text_search_query', 'semantic_search_query', 'after']),
      )
    }
  })
})
