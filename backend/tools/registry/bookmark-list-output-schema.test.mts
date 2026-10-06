import { describe, expect, it } from 'vitest'
import setBookmarkTool from '../set-bookmark.mts'

describe('bookmark output schema', () => {
  it('keeps the stored bookmark relation fields', () => {
    const schema = setBookmarkTool.meta?.outputSchema as unknown as {
      properties: { bookmark: { properties: Record<string, unknown> } }
    }
    expect(Object.keys(schema.properties.bookmark.properties).toSorted()).toEqual([
      'created_at',
      'created_by_id',
      'id',
      'object_id',
      'subject_id',
    ])
  })
})
