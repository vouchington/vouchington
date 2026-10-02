import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import getTopHostnamesTool from './get-top-hostnames.mts'
import { HOSTNAME_PAGE_LIMIT, mcpHostnameSchema } from './mcp-hostname-output.mts'
import { inlineSchemaReferences } from './route-response-schema.mts'
import searchHostnamesTool from './search-hostnames.mts'
import type { Tool } from '@services/openai-agents/tool-types'

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

function branches(tool: { meta?: Tool['meta'] }): JsonSchema[] {
  const schema = tool.meta?.outputSchema as unknown as { oneOf?: JsonSchema[] } | undefined
  if (!schema?.oneOf) throw new Error('the tool has no found-or-not-found output schema')
  return schema.oneOf
}

const TOOLS = [
  ['search_hostnames', searchHostnamesTool, '/api/v1/hostnames'],
  ['get_top_hostnames', getTopHostnamesTool, '/api/v1/hostnames/top'],
] as const

describe('hostname read tool output schemas', () => {
  it('takes the hostname fields from the public hostname contracts and no moderation field', () => {
    const hostname = propertiesOf(mcpHostnameSchema())
    const [electionNull, election] = hostname['election']!['anyOf'] as JsonSchema[]

    expect(Object.keys(hostname)).toEqual(['id', 'hostname', 'topic_id', 'election'])
    for (const field of ['id', 'hostname', 'topic_id']) {
      expect(hostname[field]).toEqual(documented('PublicViewHostname', field))
    }
    expect(electionNull).toEqual({ type: 'null' })
    expect(Object.keys(propertiesOf(election!))).toEqual([
      'votes_count_up',
      'votes_count_down',
      'votes_score_net',
    ])
    for (const [field, schema] of Object.entries(propertiesOf(election!))) {
      expect(schema).toEqual(documented('ViewHostnameElection', field))
    }
    for (const hidden of ['blocked', 'crawlable', 'emailable', 'unreliable_status_codes']) {
      expect(Object.keys(hostname)).not.toContain(hidden)
    }
  })

  it.each(TOOLS)('publishes %s as a closed page of hostnames', (name, tool) => {
    const [found, notFound] = branches(tool)
    const page = propertiesOf(found!)

    expect(tool.schema.name).toBe(name)
    expect(found!['additionalProperties']).toBe(false)
    expect(found!['required']).toEqual(Object.keys(page))
    expect(page['results']).toEqual({ type: 'array', items: mcpHostnameSchema() })
    expect(Object.keys(propertiesOf(page['page_info']!))).toEqual([
      'has_next_page',
      'start_cursor',
      'end_cursor',
    ])
    expect(propertiesOf(notFound!)).toEqual({
      success: { const: false },
      error: { type: 'string' },
    })
    expect(JSON.stringify(tool.meta?.outputSchema)).not.toContain('$ref')
  })

  it.each(TOOLS)('names the documented REST twin of %s', (_name, tool, path) => {
    const [endpoint] = tool.meta?.api ?? []

    expect(openApi.paths[path]?.get).toBeDefined()
    expect(endpoint?.method).toBe('GET')
    expect(endpoint?.path).toBe(path)
  })

  it.each(TOOLS)('reads with the hostnames:read scope and declares %s read-only', (_n, tool) => {
    expect(tool.meta?.requiredScopes).toEqual({ mcp: ['hostnames:read'] })
    expect(tool.meta?.annotations).toEqual({ readOnlyHint: true })
    expect(tool.meta?.surfaces).toEqual(['internal', 'mcp', 'client'])
    expect(tool.meta?.title).toBeTruthy()
  })

  it.each(TOOLS)('bounds the %s page size at the signed-out REST maximum', (_name, tool) => {
    const properties = tool.schema.parameters?.['properties'] as Record<string, unknown>

    expect(HOSTNAME_PAGE_LIMIT).toEqual({ min: 1, max: 25, default: 25 })
    expect(properties['limit']).toMatchObject({ type: 'integer', minimum: 1, maximum: 25 })
    expect(tool.schema.description).toContain('at most 25')
  })

  it('offers the trust sort only on search_hostnames', () => {
    const properties = searchHostnamesTool.schema.parameters?.['properties'] as Record<
      string,
      unknown
    >

    expect(properties['sort']).toMatchObject({ enum: ['trust'] })
    expect(Object.keys(getTopHostnamesTool.schema.parameters?.['properties'] ?? {})).toEqual([
      'topic',
      'limit',
      'after',
    ])
  })
})
