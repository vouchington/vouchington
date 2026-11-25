import { describe, expect, it } from 'vitest'
import { toolRouteCharges } from '@vouchington/mcp-server/tools'
import addListItemTool from '../../mcp/add-list-item.mts'
import setBookmarkTool from '../../mcp/set-bookmark.mts'

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
