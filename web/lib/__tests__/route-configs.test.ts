import { describe, expect, it } from 'vitest'

import { getPostTypeFromSlug } from '../route-configs'

describe('getPostTypeFromSlug', () => {
  it('maps slugs to PostType', () => {
    expect(getPostTypeFromSlug('review')).toBe('review')
    expect(getPostTypeFromSlug('discussion')).toBe('discussion')
    expect(getPostTypeFromSlug('data-point')).toBe('data_point')
    expect(getPostTypeFromSlug('article')).toBe('article')
    expect(getPostTypeFromSlug('blog-post')).toBe('blog_post')
  })

  it('returns undefined for invalid slugs', () => {
    expect(getPostTypeFromSlug('invalid')).toBeUndefined()
  })
})
