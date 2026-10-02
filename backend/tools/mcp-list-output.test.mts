import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import getListItemsTool from './get-list-items.mts'
import getListTool from './get-list.mts'
import getMyListsTool from './get-my-lists.mts'
import { LIST_PAGE_LIMIT, mcpListItemSchema, mcpListSchema } from './mcp-list-output.mts'
import { inlineSchemaReferences } from './route-response-schema.mts'

type JsonSchema = Record<string, unknown>
type OpenApi = {
  components: { schemas: Record<string, JsonSchema> }
  paths: Record<string, { get?: unknown }>
}

const openApi = JSON.parse(
  readFileSync(new URL('../../api-fixtures/v1/openapi.json', import.meta.url), 'utf8'),
) as OpenApi

const propertiesOf = (schema: JsonSchema) => schema['properties'] as Record<string, JsonSchema>

function documented(component: string, property: string): unknown {
  const documentedProperty = propertiesOf(openApi.components.schemas[component]!)[property]
  if (!documentedProperty) throw new Error(`${component}.${property} is not in the OpenAPI`)
  return inlineSchemaReferences(documentedProperty, openApi.components.schemas)
}

function branches(tool: typeof getListTool): JsonSchema[] {
  return (tool.meta?.outputSchema as unknown as { oneOf: JsonSchema[] }).oneOf
}

const TOOLS = [
  ['get_my_lists', getMyListsTool, '/api/v1/lists'],
  ['get_list', getListTool, '/api/v1/lists/{id}'],
  ['get_list_items', getListItemsTool, '/api/v1/lists/{id}/items'],
] as const

describe('list read tool output schemas', () => {
  it('takes the list fields from the List contract and leaves the removal marker out', () => {
    const list = propertiesOf(mcpListSchema())

    expect(Object.keys(list)).toEqual([
      'id',
      'owner_user_id',
      'name',
      'description',
      'visibility',
      'created_at',
      'updated_at',
    ])
    for (const [field, schema] of Object.entries(list)) {
      expect(schema).toEqual(documented('List', field))
    }
    expect(Object.keys(list)).not.toContain('removed_at')
  })

  it('takes the item fields from the ListItem contract', () => {
    const item = propertiesOf(mcpListItemSchema())

    expect(Object.keys(item)).toEqual([
      'id',
      'list_id',
      'item_type',
      'entity_id',
      'order_index',
      'media_type',
      'created_at',
    ])
    for (const [field, schema] of Object.entries(item)) {
      expect(schema).toEqual(documented('ListItem', field))
    }
  })

  it.each(TOOLS)('publishes %s as a closed found-or-not-found object', (name, tool) => {
    const [found, notFound] = branches(tool)

    expect(tool.schema.name).toBe(name)
    expect(found!['additionalProperties']).toBe(false)
    expect(found!['required']).toEqual(Object.keys(propertiesOf(found!)))
    expect(propertiesOf(notFound!)).toEqual({
      success: { const: false },
      error: { type: 'string' },
    })
    expect(JSON.stringify(tool.meta?.outputSchema)).not.toContain('$ref')
  })

  it('returns one list as an entry and the others as pages with their page info', () => {
    expect(propertiesOf(branches(getListTool)[0]!)['list']).toEqual(mcpListSchema())
    for (const [tool, items] of [
      [getMyListsTool, mcpListSchema()],
      [getListItemsTool, mcpListItemSchema()],
    ] as const) {
      const page = propertiesOf(branches(tool)[0]!)

      expect(page['results']).toEqual({ type: 'array', items })
      expect(Object.keys(propertiesOf(page['page_info']!))).toEqual([
        'has_next_page',
        'start_cursor',
        'end_cursor',
      ])
    }
  })

  it.each(TOOLS)('names the documented REST twin of %s', (_name, tool, path) => {
    const [endpoint] = tool.meta?.api ?? []

    expect(openApi.paths[path]?.get).toBeDefined()
    expect(endpoint?.method).toBe('GET')
    expect(endpoint?.path.replace(/:(\w+)/g, '{$1}')).toBe(path)
  })

  it.each(TOOLS)('reads with the lists:read scope and declares %s read-only', (_n, tool) => {
    expect(tool.meta?.requiredScopes).toEqual({ mcp: ['lists:read'] })
    expect(tool.meta?.annotations).toEqual({ readOnlyHint: true })
    expect(tool.meta?.surfaces).toEqual(['internal', 'mcp', 'client'])
    expect(tool.meta?.title).toBeTruthy()
  })

  it.each([
    ['get_my_lists', getMyListsTool],
    ['get_list_items', getListItemsTool],
  ] as const)('bounds the %s page size at the signed-out REST maximum', (_name, tool) => {
    const properties = tool.schema.parameters?.['properties'] as Record<string, unknown>

    expect(LIST_PAGE_LIMIT).toEqual({ min: 1, max: 25, default: 20 })
    expect(properties['limit']).toMatchObject({ type: 'integer', minimum: 1, maximum: 25 })
    expect(tool.schema.description).toContain('at most 25')
  })

  it('requires the list id of the tools that read one list', () => {
    for (const tool of [getListTool, getListItemsTool]) {
      expect(tool.schema.parameters?.['required']).toEqual(['list_id'])
    }
    expect(getMyListsTool.schema.parameters?.['required']).toEqual([])
  })
})
