import { describe, expect, it } from 'vitest'
import type { ToolApiEndpoint, ToolMeta } from '@services/openai-agents/tool-types'
import addListItemTool from '../../mcp/add-list-item.mts'
import setBookmarkTool from '../../mcp/set-bookmark.mts'
import { toolRouteCharges } from './tool-route-keys.mts'

const CREATE: ToolApiEndpoint = { method: 'POST', path: '/api/v1/things' }
const REMOVE: ToolApiEndpoint = { method: 'DELETE', path: '/api/v1/things/:id' }
const metaOf = (extra: Partial<ToolMeta>): ToolMeta =>
  ({ audience: 'user', ...extra }) as unknown as ToolMeta

describe('tool route bucket normalization', () => {
  it.each([
    [{ method: 'POST', path: '/api/v1/reports' }, 'POST:/api/v1/reports'],
    [{ method: 'PATCH', path: '/api/v1/posts/:idOrSlug' }, 'PATCH:/api/v1/posts/:idOrSlug'],
    [
      { method: 'DELETE', path: '/api/v1/admin/stories/{id}/items/{itemId}' },
      'DELETE:/api/v1/admin/stories/:id/items/:itemId',
    ],
  ] as const)('names the bucket of %j', (endpoint, key) => {
    expect(toolRouteCharges(metaOf({ api: [endpoint] }), {})).toEqual([
      { routeKeys: [key], weight: 1 },
    ])
  })
})

describe('tool route selection', () => {
  it('exercises no route for a tool with no metadata or no REST twin', () => {
    expect(toolRouteCharges(undefined, {})).toEqual([])
    expect(toolRouteCharges(metaOf({ api: null }), {})).toEqual([])
    expect(toolRouteCharges(metaOf({}), {})).toEqual([])
  })

  it('exercises each listed route once when the tool has no selector', () => {
    const api = [CREATE, REMOVE, { method: 'DELETE', path: '/api/v1/things/{id}' }] as const

    expect(toolRouteCharges(metaOf({ api: [...api] }), {})).toEqual([
      { routeKeys: ['POST:/api/v1/things', 'DELETE:/api/v1/things/:id'], weight: 1 },
    ])
  })

  it('exercises only the routes the selector picks for the arguments', () => {
    const meta = metaOf({
      api: [CREATE, REMOVE],
      selectApi: args => (args['kind'] === 'remove' ? [REMOVE] : []),
    })

    expect(toolRouteCharges(meta, { kind: 'remove' })).toEqual([
      { routeKeys: ['DELETE:/api/v1/things/:id'], weight: 1 },
    ])
    expect(toolRouteCharges(meta, { kind: 'other' })).toEqual([])
  })
})

describe('toolRouteCharges', () => {
  it('charges bookmark writes per target and topic imports once', () => {
    expect(
      toolRouteCharges(setBookmarkTool.meta, {
        predicate: 'follow',
        recommend_unknown_topics: true,
        targets: [
          { entity_type: 'topic', entity: 'Chase Sapphire Preferred' },
          { entity_type: 'post', entity: 'same-target' },
          { entity_type: 'post', entity: 'same-target' },
        ],
      }),
    ).toEqual([
      { routeKeys: ['POST:/api/v1/my/import/topics'], weight: 1 },
      { routeKeys: ['PUT:/api/v1/bookmarks/:entityType/:entityId/:predicate'], weight: 2 },
    ])
  })

  it('charges list-item routes per type and community imports once', () => {
    expect(
      toolRouteCharges(addListItemTool.meta, {
        list_id: 'list-id',
        items: [
          { item_type: 'post', entity: 'post-a' },
          { item_type: 'rss_feed_item', entity: 'feed-a' },
          { item_type: 'post', entity: 'post-a' },
        ],
      }),
    ).toEqual([
      { routeKeys: ['POST:/api/v1/lists/:id/items/posts'], weight: 2 },
      { routeKeys: ['POST:/api/v1/lists/:id/items/rss-feed-items'], weight: 1 },
    ])
    expect(
      toolRouteCharges(addListItemTool.meta, {
        list_id: 'list-id',
        source: { community: 'community-ref' },
      }),
    ).toEqual([{ routeKeys: ['POST:/api/v1/lists/:id/import'], weight: 1 }])
  })
})
