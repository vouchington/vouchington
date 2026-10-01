import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import getPostAncestorsTool from '../get-post-ancestors.mts'
import getPostDescendantsTool from '../get-post-descendants.mts'
import getPostTool from '../get-post.mts'
import getStoryTool from '../get-story.mts'
import { MCP_POST_FIELDS, mcpPostSchema } from '../mcp-post-output.mts'
import { mcpStoryItemSchema, mcpStorySchema } from '../mcp-story-output.mts'
import { inlineSchemaReferences } from '../route-response-schema.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type JsonSchema = Record<string, unknown>
type OpenApi = {
  components: { schemas: Record<string, JsonSchema> }
  paths: Record<string, { get?: unknown }>
}

const openApi = JSON.parse(
  readFileSync(new URL('../../../api-fixtures/v1/openapi.json', import.meta.url), 'utf8'),
) as OpenApi

// The read tools return a leaner shape than their REST twins, so each owns its result schema. Every
// field must stay exactly the schema the REST contract documents in the generated OpenAPI document.
function documented(component: string, property: string): unknown {
  const schema = openApi.components.schemas[component]
  const properties = schema?.['properties'] as Record<string, JsonSchema> | undefined
  const documentedProperty = properties?.[property]
  if (!documentedProperty)
    throw new Error(`${component}.${property} is not in the OpenAPI document`)
  return inlineSchemaReferences(documentedProperty, openApi.components.schemas)
}

function propertiesOf(schema: JsonSchema): Record<string, unknown> {
  return schema['properties'] as Record<string, unknown>
}

function branches(tool: { meta?: Tool['meta'] }): JsonSchema[] {
  const schema = tool.meta?.outputSchema as unknown as { oneOf?: JsonSchema[] } | undefined
  if (!schema?.oneOf) throw new Error('the tool has no found-or-not-found output schema')
  return schema.oneOf
}

describe('post and story read tool output schemas', () => {
  it('takes every post field from the Post contract', () => {
    const properties = propertiesOf(mcpPostSchema())

    expect(Object.keys(properties)).toEqual([...MCP_POST_FIELDS])
    for (const field of MCP_POST_FIELDS) {
      expect(properties[field]).toEqual(documented('Post', field))
    }
  })

  it('takes every story field from the Story contract', () => {
    const properties = propertiesOf(mcpStorySchema())

    expect(Object.keys(properties)).toEqual([
      'id',
      'title',
      'cluster_reason',
      'published_at',
      'official_rss_feed_item_id',
      'created_at',
      'updated_at',
    ])
    for (const [field, schema] of Object.entries(properties)) {
      expect(schema).toEqual(documented('Story', field))
    }
  })

  it('takes the story article ids, link and dates from the RSS contracts', () => {
    const properties = propertiesOf(mcpStoryItemSchema())

    expect(properties['id']).toEqual(documented('ViewRssFeedItem', 'id'))
    expect(properties['guid']).toEqual(documented('ViewRssFeedItem', 'guid'))
    expect(properties['published_at']).toEqual(documented('ViewRssFeedItem', 'published_at'))
    expect(properties['url']).toEqual(documented('ViewUrl', 'url'))
    expect(properties['rss_feed_id']).toEqual(documented('ViewRssFeed', 'id'))
    expect(properties['rss_feed_title']).toEqual(documented('ViewRssFeed', 'title'))
  })

  it.each([
    ['get_post_descendants', getPostDescendantsTool],
    ['get_story', getStoryTool],
  ])('takes the page info of %s from the PageInfo contract', (_name, tool) => {
    const found = propertiesOf(branches(tool)[0]!)
    const pageInfo = propertiesOf(found['page_info'] as JsonSchema)

    expect(Object.keys(pageInfo)).toEqual(['has_next_page', 'start_cursor', 'end_cursor'])
    for (const field of Object.keys(pageInfo)) {
      expect(pageInfo[field]).toEqual(documented('PageInfo', field))
    }
  })

  it.each([
    ['get_post', getPostTool, ['post']],
    ['get_post_ancestors', getPostAncestorsTool, ['ancestors']],
    ['get_post_descendants', getPostDescendantsTool, ['descendants', 'page_info']],
    ['get_story', getStoryTool, ['story', 'items', 'page_info']],
  ] as const)('publishes %s as a found-or-not-found object', (name, tool, fields) => {
    const schema = tool.meta?.outputSchema as JsonSchema
    const [found, notFound] = branches(tool)

    expect(tool.schema.name).toBe(name)
    expect(schema['type']).toBe('object')
    expect(Object.keys(propertiesOf(found!))).toEqual(['success', ...fields])
    expect(found!['required']).toEqual(['success', ...fields])
    expect(found!['additionalProperties']).toBe(false)
    expect(propertiesOf(notFound!)).toEqual({
      success: { const: false },
      error: { type: 'string' },
    })
    expect(JSON.stringify(schema)).not.toContain('$ref')
  })

  it.each([
    ['get_post', getPostTool, '/api/v1/posts/{idOrSlug}'],
    ['get_post_ancestors', getPostAncestorsTool, '/api/v1/posts/{idOrSlug}/ancestors'],
    ['get_post_descendants', getPostDescendantsTool, '/api/v1/posts/{idOrSlug}/descendants'],
    ['get_story', getStoryTool, '/api/v1/stories/{id}'],
  ] as const)('names the documented REST twin of %s', (_name, tool, path) => {
    const [endpoint] = tool.meta?.api ?? []

    expect(openApi.paths[path]?.get).toBeDefined()
    expect(endpoint?.method).toBe('GET')
    expect(endpoint?.path.replace(/:(\w+)/g, '{$1}')).toBe(path)
  })

  it.each([
    ['get_post', getPostTool],
    ['get_post_ancestors', getPostAncestorsTool],
    ['get_post_descendants', getPostDescendantsTool],
    ['get_story', getStoryTool],
  ] as const)('reads with the posts:read scope and declares %s read-only', (_name, tool) => {
    expect(tool.meta?.requiredScopes).toEqual({ mcp: ['posts:read'] })
    expect(tool.meta?.annotations).toEqual({ readOnlyHint: true })
    expect(tool.meta?.surfaces).toEqual(['internal', 'mcp', 'client'])
    expect(tool.meta?.title).toBeTruthy()
  })
})
