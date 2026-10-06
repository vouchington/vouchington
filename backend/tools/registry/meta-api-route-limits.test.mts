import { describe, expect, it } from 'vitest'
import type { Tool, ToolApiEndpoint } from '@services/openai-agents/tool-types'
import { ALL_TOOLS } from './index.mts'

// MCP charges a tool call to the rate-limit bucket of each REST route in `meta.api`, so a tool that
// forgets to declare its REST twin skips that route's limit. These tools are read-only aggregates
// built from data stores, with no REST route to charge.
const NO_REST_TWIN = new Set([
  'get_domain_ratings',
  'get_topic_insights',
  'get_topic_metrics',
  'search_data_points',
])

const isMcpTool = (tool: Tool) =>
  (tool.meta?.surfaces ?? []).some(surface => surface === 'mcp' || surface === 'admin_mcp')
const mcpTools = ALL_TOOLS.filter(isMcpTool)
const sameEndpoint = (a: ToolApiEndpoint, b: ToolApiEndpoint) =>
  a.method === b.method && a.path === b.path

// Every `enum` or `const` value a schema gives an argument, one argument at a time, through `oneOf`
// branches too.
function discriminatorCalls(schema: unknown): Record<string, unknown>[] {
  if (Array.isArray(schema)) return schema.flatMap(discriminatorCalls)
  if (typeof schema !== 'object' || schema === null) return []
  const { properties, oneOf, anyOf } = schema as Record<string, unknown>
  const own = Object.entries((properties ?? {}) as Record<string, Record<string, unknown>>).flatMap(
    ([name, property]) =>
      (
        (property['enum'] as unknown[] | undefined) ??
        ('const' in property ? [property['const']] : [])
      ).map(value => ({ [name]: value })),
  )
  return [...own, ...discriminatorCalls(oneOf), ...discriminatorCalls(anyOf)]
}

// The calls that can pick a route: no arguments, every discriminator value, and each argument merely
// present, since a route can also depend on whether an optional argument is given.
function routePickingCalls(schema: unknown): Record<string, unknown>[] {
  const { properties } = (schema ?? {}) as { properties?: Record<string, unknown> }
  return [
    {},
    ...discriminatorCalls(schema),
    ...Object.keys(properties ?? {}).map(name => ({ [name]: 'present' })),
  ]
}
const selectedRoutes = (tool: Tool) =>
  routePickingCalls(tool.schema.parameters).flatMap(args => tool.meta!.selectApi!(args))

describe('MCP tools and their REST routes', () => {
  it('declares meta.api on every MCP tool that has a REST twin', () => {
    const undeclared = mcpTools.filter(tool => !tool.meta?.api).map(t => t.schema.name)

    // A new tool lands here until it names its REST twin, or is reviewed as having none.
    expect(undeclared.toSorted()).toEqual([...NO_REST_TWIN].toSorted())
  })

  it('declares every route as a REST method and a /api/v1 path', () => {
    const routes = mcpTools.flatMap(tool => tool.meta?.api ?? [])

    expect(routes.length).toBeGreaterThan(0)
    for (const { method, path } of routes) {
      expect(`${method}:${path}`).toMatch(/^(GET|POST|PUT|PATCH|DELETE):\/api\/v1\/\S+$/)
    }
  })

  describe('selectApi', () => {
    const selecting = mcpTools.filter(tool => tool.meta?.selectApi)

    it('is declared by the tools whose arguments pick among several routes', () => {
      expect(selecting.length).toBeGreaterThan(0)
    })

    it.each(selecting.map(tool => [tool.schema.name, tool] as const))(
      '%s selects only routes that its meta.api lists, and each of them for some call',
      (_name, tool) => {
        const listed = tool.meta!.api!
        const selected = selectedRoutes(tool)

        expect(selected.length).toBeGreaterThan(0)
        for (const endpoint of selected) {
          expect(listed.some(entry => sameEndpoint(entry, endpoint))).toBe(true)
        }
        for (const entry of listed) {
          expect(selected.some(endpoint => sameEndpoint(entry, endpoint))).toBe(true)
        }
      },
    )

    it('reaches both routes of a tool that picks one by whether an optional argument is given', () => {
      const scoped: ToolApiEndpoint = { method: 'POST', path: '/api/v1/scopes/:id/items' }
      const global: ToolApiEndpoint = { method: 'POST', path: '/api/v1/items' }
      const tool = {
        schema: {
          name: 'optional_argument_fixture',
          type: 'function',
          parameters: { type: 'object', properties: { scope_id: { type: 'string' } } },
          strict: null,
        },
        function: () => () => Promise.resolve({}),
        meta: {
          surfaces: ['mcp'],
          api: [global, scoped],
          selectApi: (args: Record<string, unknown>) => [args['scope_id'] ? scoped : global],
        },
      } as unknown as Tool

      const selected = selectedRoutes(tool)

      expect(selected).toContainEqual(scoped)
      expect(selected).toContainEqual(global)
    })
  })
})
