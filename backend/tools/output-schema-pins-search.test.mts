import { documentedResponseProperty } from '@voucha/test-helpers/openapi-documented-response'
import { describe, expect, it } from 'vitest'
import searchPostsTool from './search-posts.mts'
import searchTopicsTool from './search-topics.mts'

type JsonSchema = Record<string, unknown>

const properties = (schema: unknown): Record<string, unknown> =>
  (schema as JsonSchema)['properties'] as Record<string, unknown>

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
    expect(properties(tool.meta?.outputSchema)['page_info']).toEqual(
      documentedPostsField('page_info'),
    )
  })

  it('search_posts takes the post id and post_type from the documented result item', () => {
    const documentedItem = properties(
      (documentedPostsField('results') as { items: JsonSchema }).items,
    )
    const results = properties(searchPostsTool.meta?.outputSchema)['results'] as {
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
