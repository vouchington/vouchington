import { describe, expect, it } from 'vitest'
import { isEditablePostType } from './post-editability'

describe('isEditablePostType', () => {
  it.each(['review', 'discussion', 'data_point', 'article', 'blog_post'])(
    'returns true for editable type %s',
    type => {
      expect(isEditablePostType(type)).toBe(true)
    },
  )

  it.each(['comment', 'unknown', ''])('returns false for non-editable type %s', type => {
    expect(isEditablePostType(type)).toBe(false)
  })
})
