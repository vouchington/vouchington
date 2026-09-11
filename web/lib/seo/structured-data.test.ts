import { describe, it, expect } from 'vitest'
import { createPostSchema } from './post-schema'

describe('createPostSchema - itemReviewedType', () => {
  it('uses provided itemReviewedType in review branch', () => {
    const result = createPostSchema({
      kind: 'review',
      title: 'My Review',
      description: 'A book review',
      path: '/posts/my-review',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      itemName: 'Test Book',
      itemReviewedType: 'Book',
    })

    expect(result).toBeDefined()
    expect(result['@type']).toBe('Review')
    expect(result.itemReviewed).toBeDefined()
    expect((result.itemReviewed as Record<string, unknown>)['@type']).toBe('Book')
  })

  it('defaults itemReviewed to Thing when itemReviewedType not provided', () => {
    const result = createPostSchema({
      kind: 'review',
      title: 'My Review',
      description: 'A review',
      path: '/posts/my-review',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      itemName: 'Test Item',
    })

    expect(result).toBeDefined()
    expect(result['@type']).toBe('Review')
    expect(result.itemReviewed).toBeDefined()
    expect((result.itemReviewed as Record<string, unknown>)['@type']).toBe('Thing')
  })

  it('uses Thing when itemReviewedType is explicitly undefined', () => {
    const result = createPostSchema({
      kind: 'review',
      title: 'My Review',
      description: 'A review',
      path: '/posts/my-review',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      itemName: 'Test Item',
      itemReviewedType: undefined,
    })

    expect(result).toBeDefined()
    expect((result.itemReviewed as Record<string, unknown>)['@type']).toBe('Thing')
  })
})
