import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import getCommunityMembersTool from './get-community-members.mts'
import getCommunityPinnedPostsTool from './get-community-pinned-posts.mts'
import getCommunityPostsTool from './get-community-posts.mts'
import getCommunityTool from './get-community.mts'
import { COMMUNITY_PAGE_LIMIT, mcpCommunityEntryProperties } from './mcp-community-output.mts'
import { mcpPostSchema } from './mcp-post-output.mts'
import { inlineSchemaReferences } from './route-response-schema.mts'
import searchCommunitiesTool from './search-communities.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type JsonSchema = Record<string, unknown>
type RequestContracts = {
  components: Record<string, JsonSchema>
  paths: Record<string, { get?: unknown }>
}

const contracts = JSON.parse(
  readFileSync(new URL('../../api-fixtures/v1/request-contracts.json', import.meta.url), 'utf8'),
) as RequestContracts

// Each tool returns a leaner shape than its REST twin, so it owns its result schema. Every field
// must stay exactly the schema the REST contract documents in the generated runtime contract bundle.
function documented(component: string, property: string): unknown {
  const properties = contracts.components[component]?.['properties'] as
    | Record<string, JsonSchema>
    | undefined
  const documentedProperty = properties?.[property]
  if (!documentedProperty)
    throw new Error(`${component}.${property} is not in the runtime contract bundle`)
  return inlineSchemaReferences(documentedProperty, contracts.components)
}

function propertiesOf(schema: JsonSchema): Record<string, JsonSchema> {
  return schema['properties'] as Record<string, JsonSchema>
}

function branches(tool: { meta?: Tool['meta'] }): JsonSchema[] {
  const schema = tool.meta?.outputSchema as unknown as { oneOf?: JsonSchema[] } | undefined
  if (!schema?.oneOf) throw new Error('the tool has no found-or-not-found output schema')
  return schema.oneOf
}

const TOOLS = [
  ['search_communities', searchCommunitiesTool, '/api/v1/communities'],
  ['get_community', getCommunityTool, '/api/v1/communities/{idOrSlug}'],
  ['get_community_posts', getCommunityPostsTool, '/api/v1/communities/{idOrSlug}/posts'],
  [
    'get_community_pinned_posts',
    getCommunityPinnedPostsTool,
    '/api/v1/communities/{idOrSlug}/pinned-posts',
  ],
  ['get_community_members', getCommunityMembersTool, '/api/v1/communities/{idOrSlug}/members'],
] as const

describe('community read tool output schemas', () => {
  it('takes the community, owner and metrics fields from the Community contracts', () => {
    const { community, owner, metrics } = mcpCommunityEntryProperties()

    for (const [field, schema] of Object.entries(propertiesOf(community))) {
      expect(schema).toEqual(documented('Community', field))
    }
    expect(Object.keys(propertiesOf(community))).not.toContain('created_by_id')
    expect(Object.keys(propertiesOf(community))).not.toContain('visibility')
    const [ownerNull, ownerObject] = owner['anyOf'] as JsonSchema[]
    const [metricsNull, metricsObject] = metrics['anyOf'] as JsonSchema[]
    expect(ownerNull).toEqual({ type: 'null' })
    expect(metricsNull).toEqual({ type: 'null' })
    expect(Object.keys(propertiesOf(ownerObject!))).toEqual(['id', 'username'])
    const metricProperties = propertiesOf(metricsObject!)
    for (const [field, schema] of Object.entries(metricProperties)) {
      expect(schema).toEqual(documented('CommunityMetrics', field))
    }
    expect(Object.keys(metricProperties)).toHaveLength(6)
  })

  it('takes the member fields from the CommunityMember contract', () => {
    const found = propertiesOf(branches(getCommunityMembersTool)[0]!)
    const items = (found['results'] as { items: JsonSchema }).items
    const member = propertiesOf(items)

    expect(Object.keys(member)).toEqual(['user_id', 'username', 'role', 'created_at'])
    for (const field of ['user_id', 'role', 'created_at']) {
      expect(member[field]).toEqual(documented('CommunityMember', field))
    }
  })

  it.each([
    ['search_communities', searchCommunitiesTool],
    ['get_community_posts', getCommunityPostsTool],
    ['get_community_members', getCommunityMembersTool],
  ] as const)('takes the page info of %s from the PageInfo contract', (_name, tool) => {
    const found = propertiesOf(branches(tool)[0]!)
    const pageInfo = propertiesOf(found['page_info']!)

    expect(Object.keys(pageInfo)).toEqual(['has_next_page', 'start_cursor', 'end_cursor'])
    for (const field of Object.keys(pageInfo)) {
      expect(pageInfo[field]).toEqual(documented('PageInfo', field))
    }
  })

  it('hydrates posts with the same leaner post shape the post read tools return', () => {
    const posts = propertiesOf(branches(getCommunityPinnedPostsTool)[0]!)['pinned_posts']
    expect((posts as { items: unknown }).items).toEqual(mcpPostSchema())
    expect(propertiesOf(branches(getCommunityPostsTool)[0]!)['results']).toEqual({
      type: 'array',
      items: mcpPostSchema(),
    })
  })

  it.each(TOOLS)('publishes %s as a closed found-or-not-found object', (name, tool) => {
    const schema = tool.meta?.outputSchema as JsonSchema
    const [found, notFound] = branches(tool)

    expect(tool.schema.name).toBe(name)
    expect(schema['type']).toBe('object')
    expect(found!['additionalProperties']).toBe(false)
    expect(Object.keys(propertiesOf(found!))[0]).toBe('success')
    expect(found!['required']).toEqual(Object.keys(propertiesOf(found!)))
    expect(propertiesOf(notFound!)).toEqual({
      success: { const: false },
      error: { type: 'string' },
    })
    expect(JSON.stringify(schema)).not.toContain('$ref')
  })

  it.each(TOOLS)('names the documented REST twin of %s', (_name, tool, path) => {
    const [endpoint] = tool.meta?.api ?? []

    expect(endpoint?.method).toBe('GET')
    expect(endpoint?.path.replace(/:(\w+)/g, '{$1}')).toBe(path)
  })

  it.each(TOOLS)('reads with the communities:read scope and declares %s read-only', (_n, tool) => {
    expect(tool.meta?.requiredScopes).toEqual({ mcp: ['communities:read'] })
    expect(tool.meta?.annotations).toEqual({ readOnlyHint: true })
    expect(tool.meta?.surfaces).toEqual(['internal', 'mcp', 'client'])
    expect(tool.meta?.title).toBeTruthy()
  })

  it.each([
    ['search_communities', searchCommunitiesTool],
    ['get_community_posts', getCommunityPostsTool],
    ['get_community_members', getCommunityMembersTool],
  ] as const)('bounds the %s page size at the documented maximum', (_name, tool) => {
    const { min, max } = COMMUNITY_PAGE_LIMIT
    const properties = tool.schema.parameters?.['properties'] as
      | Record<string, JsonSchema>
      | undefined

    expect(max).toBe(25)
    expect(properties?.['limit']).toMatchObject({ type: 'integer', minimum: min, maximum: max })
    expect(tool.schema.description).toContain(`at most ${max}`)
  })
})
