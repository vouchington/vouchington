import { describe, expect, it } from 'vitest'
import type { ToolApiEndpoint, ToolMeta } from '@services/openai-agents/tool-types'
import { toolRouteKeys, toRouteKey } from './tool-route-keys.mts'

const CREATE: ToolApiEndpoint = { method: 'POST', path: '/api/v1/things' }
const REMOVE: ToolApiEndpoint = { method: 'DELETE', path: '/api/v1/things/:id' }
const metaOf = (extra: Partial<ToolMeta>): ToolMeta =>
  ({ surfaces: ['mcp'], ...extra }) as unknown as ToolMeta

describe('toRouteKey', () => {
  it.each([
    [{ method: 'POST', path: '/api/v1/reports' }, 'POST:/api/v1/reports'],
    [{ method: 'PATCH', path: '/api/v1/posts/:idOrSlug' }, 'PATCH:/api/v1/posts/:idOrSlug'],
    [
      { method: 'DELETE', path: '/api/v1/admin/stories/{id}/items/{itemId}' },
      'DELETE:/api/v1/admin/stories/:id/items/:itemId',
    ],
  ] as const)('names the bucket of %j', (endpoint, key) => {
    expect(toRouteKey(endpoint)).toBe(key)
  })
})

describe('toolRouteKeys', () => {
  it('exercises no route for a tool with no metadata or no REST twin', () => {
    expect(toolRouteKeys(undefined, {})).toEqual([])
    expect(toolRouteKeys(metaOf({ api: null }), {})).toEqual([])
    expect(toolRouteKeys(metaOf({}), {})).toEqual([])
  })

  it('exercises each listed route once when the tool has no selector', () => {
    const api = [CREATE, REMOVE, { method: 'DELETE', path: '/api/v1/things/{id}' }] as const

    expect(toolRouteKeys(metaOf({ api: [...api] }), {})).toEqual([
      'POST:/api/v1/things',
      'DELETE:/api/v1/things/:id',
    ])
  })

  it('exercises only the routes the selector picks for the arguments', () => {
    const meta = metaOf({
      api: [CREATE, REMOVE],
      selectApi: args => (args['kind'] === 'remove' ? [REMOVE] : []),
    })

    expect(toolRouteKeys(meta, { kind: 'remove' })).toEqual(['DELETE:/api/v1/things/:id'])
    expect(toolRouteKeys(meta, { kind: 'other' })).toEqual([])
  })
})
