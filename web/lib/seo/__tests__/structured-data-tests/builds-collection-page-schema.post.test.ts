import { describe, expect, it } from 'vitest'
import { createPostSchema } from '../../post-schema'

describe('structured data helpers — post schemas', () => {
  it('builds article schema for article pages', () => {
    const schema = createPostSchema({
      kind: 'article',
      title: 'Best Rewards Cards',
      description: 'Long-form article content',
      path: '/article/best-rewards-cards',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      authorName: 'jong',
    })

    expect(schema['@type']).toBe('Article')
    expect(schema.url).toBe('https://voucha.ai/article/best-rewards-cards')
  })

  it('builds blog posting schema for blog pages', () => {
    const schema = createPostSchema({
      kind: 'blog-post',
      title: 'Shipping SEO Fixes',
      description: 'Ship log',
      path: '/blog/shipping-seo-fixes',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    })

    expect(schema['@type']).toBe('BlogPosting')
  })

  it('builds review schema with rating when present', () => {
    const schema = createPostSchema({
      kind: 'review',
      title: 'Amex Gold review',
      description: 'Strong dining earn rates',
      path: '/review/amex-gold',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      reviewRating: 4,
      itemName: 'American Express Gold',
    })

    expect(schema['@type']).toBe('Review')
    expect(schema.reviewRating).toMatchObject({
      '@type': 'Rating',
      ratingValue: 4,
    })
  })

  it('omits reviewRating when a review has no numeric rating yet', () => {
    const schema = createPostSchema({
      kind: 'review',
      title: 'Pending review',
      description: 'No rating yet',
      path: '/review/pending-review',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    })

    expect(schema['@type']).toBe('Review')
    expect(schema).not.toHaveProperty('reviewRating')
  })

  it('builds discussion schema for community content', () => {
    const schema = createPostSchema({
      kind: 'discussion',
      title: 'Best transfer partners?',
      description: 'Community conversation',
      path: '/discussion/transfer-partners',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    })

    expect(schema['@type']).toBe('DiscussionForumPosting')
    expect(schema.text).toBe('Community conversation')
    expect(schema).not.toHaveProperty('articleBody')
  })

  it('includes nested comments in discussion schema', () => {
    const schema = createPostSchema({
      kind: 'discussion',
      title: 'Best transfer partners?',
      description: 'Community conversation',
      path: '/discussion/transfer-partners',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      comments: [
        {
          authorName: 'alice',
          datePublished: '2026-03-01T12:00:00.000Z',
          text: 'Great discussion!',
        },
        {
          datePublished: '2026-03-01T13:00:00.000Z',
          text: 'Anonymous reply',
        },
      ],
    })

    const comments = schema.comment as Record<string, unknown>[]
    expect(comments).toHaveLength(2)
    expect(comments[0]).toMatchObject({
      '@type': 'Comment',
      text: 'Great discussion!',
      author: { '@type': 'Person', name: 'alice' },
    })
    expect(comments[1]).not.toHaveProperty('author')
  })

  it('includes interaction statistics in discussion schema', () => {
    const schema = createPostSchema({
      kind: 'discussion',
      title: 'Best transfer partners?',
      description: 'Community conversation',
      path: '/discussion/transfer-partners',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      interactionStats: {
        upvotes: 42,
        commentCount: 15,
      },
    })

    const stats = schema.interactionStatistic as Record<string, unknown>[]
    expect(stats).toHaveLength(2)
    expect(stats[0]).toMatchObject({
      '@type': 'InteractionCounter',
      interactionType: { '@type': 'LikeAction' },
      userInteractionCount: 42,
    })
    expect(stats[1]).toMatchObject({
      '@type': 'InteractionCounter',
      interactionType: { '@type': 'CommentAction' },
      userInteractionCount: 15,
    })
  })

  it('omits comments and interaction stats when not provided', () => {
    const schema = createPostSchema({
      kind: 'discussion',
      title: 'Simple post',
      description: 'No extras',
      path: '/discussion/simple',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    })

    expect(schema).not.toHaveProperty('comment')
    expect(schema).not.toHaveProperty('interactionStatistic')
  })

  it('includes author URL and @id in article schema when provided', () => {
    const schema = createPostSchema({
      kind: 'article',
      title: 'Best Rewards Cards',
      description: 'Long-form article content',
      path: '/article/best-rewards-cards',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      authorName: 'jong',
      authorUrl: '/user/jong',
    })

    expect(schema.author).toEqual({
      '@type': 'Person',
      name: 'jong',
      '@id': 'https://voucha.ai/user/jong',
      url: 'https://voucha.ai/user/jong',
    })
  })

  it('omits author URL and @id when authorUrl is not provided', () => {
    const schema = createPostSchema({
      kind: 'article',
      title: 'Best Rewards Cards',
      description: 'Long-form article content',
      path: '/article/best-rewards-cards',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      authorName: 'jong',
    })

    expect(schema.author).toEqual({
      '@type': 'Person',
      name: 'jong',
    })
  })

  it('includes author URL and @id in blog posting schema', () => {
    const schema = createPostSchema({
      kind: 'blog-post',
      title: 'Shipping SEO Fixes',
      description: 'Ship log',
      path: '/blog/shipping-seo-fixes',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      authorName: 'jong',
      authorUrl: '/user/jong',
    })

    expect(schema['@type']).toBe('BlogPosting')
    expect(schema.author).toEqual({
      '@type': 'Person',
      name: 'jong',
      '@id': 'https://voucha.ai/user/jong',
      url: 'https://voucha.ai/user/jong',
    })
  })

  it('includes author URL and @id in review schema', () => {
    const schema = createPostSchema({
      kind: 'review',
      title: 'Amex Gold review',
      description: 'Strong dining earn rates',
      path: '/review/amex-gold',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      authorName: 'jong',
      authorUrl: '/user/jong',
      reviewRating: 4,
      itemName: 'American Express Gold',
    })

    expect(schema.author).toEqual({
      '@type': 'Person',
      name: 'jong',
      '@id': 'https://voucha.ai/user/jong',
      url: 'https://voucha.ai/user/jong',
    })
  })

  it('includes author URL and @id in discussion forum posting schema', () => {
    const schema = createPostSchema({
      kind: 'discussion',
      title: 'Best transfer partners?',
      description: 'Community conversation',
      path: '/discussion/transfer-partners',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      authorName: 'jong',
      authorUrl: '/user/jong',
    })

    expect(schema['@type']).toBe('DiscussionForumPosting')
    expect(schema.author).toEqual({
      '@type': 'Person',
      name: 'jong',
      '@id': 'https://voucha.ai/user/jong',
      url: 'https://voucha.ai/user/jong',
    })
  })
})
