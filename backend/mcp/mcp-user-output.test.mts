import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import getUserTool from './get-user.mts'
import { mcpUserSchema, USER_PAGE_LIMIT } from './mcp-user-output.mts'
import { inlineSchemaReferences } from './route-response-schema.mts'
import searchUsersTool from './search-users.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type JsonSchema = Record<string, unknown>
type RequestContracts = {
  components: Record<string, JsonSchema>
  paths: Record<string, { get?: unknown }>
}

const contracts = JSON.parse(
  readFileSync(new URL('../../api-fixtures/v1/request-contracts.json', import.meta.url), 'utf8'),
) as RequestContracts

const propertiesOf = (schema: JsonSchema) => schema['properties'] as Record<string, JsonSchema>

// The public user contract is a map value in the generated runtime contract bundle.
function documentedUser(field: string): unknown {
  const entry = contracts.components['Record_string_PublicUser']?.['additionalProperties']
  const documented = propertiesOf(entry as JsonSchema)[field]
  if (!documented) throw new Error(`PublicUser.${field} is not in the runtime contract bundle`)
  return inlineSchemaReferences(documented, contracts.components)
}

function branches(tool: { meta?: Tool['meta'] }): JsonSchema[] {
  const schema = tool.meta?.outputSchema as unknown as { oneOf?: JsonSchema[] } | undefined
  if (!schema?.oneOf) throw new Error('the tool has no found-or-not-found output schema')
  return schema.oneOf
}

const TOOLS = [
  ['get_user', getUserTool, '/api/v1/users/{idOrSlug}'],
  ['search_users', searchUsersTool, '/api/v1/users'],
] as const

describe('user read tool output schemas', () => {
  it('takes every user field from the PublicUser contract and no other', () => {
    const user = propertiesOf(mcpUserSchema())

    expect(Object.keys(user)).toEqual([
      'id',
      'username',
      'markdown',
      'verification_status',
      'is_verified_badge_visible',
      'verified_display_name',
      'account_type',
    ])
    for (const [field, schema] of Object.entries(user)) {
      expect(schema).toEqual(documentedUser(field))
    }
    expect(mcpUserSchema()['additionalProperties']).toBe(false)
    expect(Object.keys(user)).not.toContain('email')
    expect(Object.keys(user)).not.toContain('phone_number')
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

  it('returns the user as one entry and the matches as a page', () => {
    expect(propertiesOf(branches(getUserTool)[0]!)['user']).toEqual(mcpUserSchema())
    const page = propertiesOf(branches(searchUsersTool)[0]!)

    expect(page['results']).toEqual({ type: 'array', items: mcpUserSchema() })
    expect(Object.keys(propertiesOf(page['page_info']!))).toEqual([
      'has_next_page',
      'start_cursor',
      'end_cursor',
    ])
  })

  it.each(TOOLS)('names the documented REST twin of %s', (_name, tool, path) => {
    const [endpoint] = tool.meta?.api ?? []

    expect(endpoint?.method).toBe('GET')
    expect(endpoint?.path.replace(/:(\w+)/g, '{$1}')).toBe(path)
  })

  it.each(TOOLS)('reads with the users:read scope and declares %s read-only', (_n, tool) => {
    expect(tool.meta?.requiredScopes).toEqual({ mcp: ['users:read'] })
    expect(tool.meta?.annotations).toEqual({ readOnlyHint: true })
    expect(tool.meta?.surfaces).toEqual(['internal', 'mcp'])
    expect(tool.meta?.title).toBeTruthy()
  })

  it('bounds the search_users page size like the REST route', () => {
    const properties = searchUsersTool.schema.parameters?.['properties'] as Record<string, unknown>

    expect(USER_PAGE_LIMIT).toEqual({ min: 1, max: 25, default: 10 })
    expect(properties['limit']).toMatchObject({ type: 'integer', minimum: 1, maximum: 25 })
    expect(searchUsersTool.schema.description).toContain('at most 25')
    expect(searchUsersTool.schema.parameters?.['required']).toEqual(['q'])
  })
})
