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

describe('search tool output schemas', () => {
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
