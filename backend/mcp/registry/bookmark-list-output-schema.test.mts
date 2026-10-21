import { describe, expect, it } from 'vitest'
import setBookmarkTool from '../set-bookmark.mts'

describe('bookmark output schema', () => {
  it('keeps the stored bookmark relation fields', () => {
    const schema = setBookmarkTool.meta?.outputSchema as unknown as {
      properties: {
        results: {
          items: { additionalProperties: boolean; properties: { status: { enum: string[] } } }
        }
      }
    }
    const item = schema.properties.results.items
    // The stored bookmark columns ride along on a set result. Naming them in the schema pushes the
    // pinned Plus list past 222000, which this issue does not allow.
    expect(item.additionalProperties).toBe(true)
    expect(item.properties.status.enum).toContain('set')
  })

  it('charges topic import only when a follow target is a topic', () => {
    const selectApi = setBookmarkTool.meta?.selectApi
    const routes = selectApi?.({
      predicate: 'follow',
      recommend_unknown_topics: true,
      targets: [
        { entity_type: 'topic', entity: 'named' },
        { entity_type: 'post', entity: 'id' },
        null,
      ],
    })
    expect(routes?.map(route => `${route.method} ${route.path}`)).toEqual([
      'POST /api/v1/my/import/topics',
      'PUT /api/v1/bookmarks/:entityType/:entityId/:predicate',
    ])
  })

  it('charges a UUID topic follow as a bookmark', () => {
    const selectApi = setBookmarkTool.meta?.selectApi
    const routes = selectApi?.({
      predicate: 'follow',
      recommend_unknown_topics: true,
      targets: [{ entity_type: 'topic', entity: '00000000-0000-4000-8000-000000000000' }],
    })
    expect(routes?.map(route => `${route.method} ${route.path}`)).toEqual([
      'PUT /api/v1/bookmarks/:entityType/:entityId/:predicate',
    ])
  })
})
