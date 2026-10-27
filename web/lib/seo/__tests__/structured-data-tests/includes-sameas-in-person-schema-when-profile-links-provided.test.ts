import { describe, expect, it } from 'vitest'
import { createPostSchema } from '../../post-schema'

describe('structured data helpers', () => {
  it('includes articleSection and keywords in article schema', () => {
    const schema = createPostSchema({
      kind: 'article',
      title: 'Best Rewards Cards',
      description: 'Long-form article content',
      path: '/article/best-rewards-cards',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      articleSection: 'Credit Cards',
      keywords: ['rewards', 'travel', 'points'],
      inLanguage: 'en',
    })

    expect(schema.articleSection).toBe('Credit Cards')
    expect(schema.keywords).toBe('rewards,travel,points')
    expect(schema.inLanguage).toBe('en')
  })

  it('accepts keywords as a string', () => {
    const schema = createPostSchema({
      kind: 'article',
      title: 'Best Rewards Cards',
      description: 'Article content',
      path: '/article/best-rewards-cards',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      keywords: 'rewards,travel',
    })

    expect(schema.keywords).toBe('rewards,travel')
  })

  it('omits articleSection and keywords when not provided in article schema', () => {
    const schema = createPostSchema({
      kind: 'article',
      title: 'Best Rewards Cards',
      description: 'Article content',
      path: '/article/best-rewards-cards',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
    })

    expect(schema).not.toHaveProperty('articleSection')
    expect(schema).not.toHaveProperty('keywords')
    expect(schema).not.toHaveProperty('inLanguage')
  })

  it('does not include articleSection or keywords in discussion schema', () => {
    const schema = createPostSchema({
      kind: 'discussion',
      title: 'A discussion',
      description: 'Content',
      path: '/discussion/test',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      articleSection: 'Ignored',
      keywords: ['ignored'],
    })

    expect(schema['@type']).toBe('DiscussionForumPosting')
    expect(schema).not.toHaveProperty('articleSection')
    expect(schema).not.toHaveProperty('keywords')
  })
})
