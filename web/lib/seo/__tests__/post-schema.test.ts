import { describe, expect, it } from 'vitest'
import { createPostSchema } from '../post-schema'

const baseArgs = {
  title: 'Test Post',
  description: 'A test description.',
  path: '/discussions/test-post',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
}

describe('createPostSchema', () => {
  it('falls back to Organization author when authorName is absent', () => {
    const schema = createPostSchema({ ...baseArgs, kind: 'discussion' })

    expect(schema['author']).toMatchObject({
      '@type': 'Organization',
      name: 'Voucha',
      url: 'https://voucha.ai/',
    })
  })

  it('emits discussionUrl equal to the post url for discussion posts', () => {
    const schema = createPostSchema({ ...baseArgs, kind: 'discussion' })

    expect(schema['discussionUrl']).toBe('https://voucha.ai/discussions/test-post')
    expect(schema['discussionUrl']).toBe(schema['url'])
  })

  it('populates dateModified from updatedAt', () => {
    const schema = createPostSchema({
      ...baseArgs,
      kind: 'article',
      updatedAt: '2026-04-15T12:00:00.000Z',
    })

    expect(schema['dateModified']).toBe('2026-04-15T12:00:00.000Z')
  })

  it('dateModified differs from datePublished when updatedAt differs from createdAt', () => {
    const schema = createPostSchema({
      ...baseArgs,
      kind: 'article',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-04-15T12:00:00.000Z',
    })

    expect(schema['datePublished']).toBe('2026-03-01T00:00:00.000Z')
    expect(schema['dateModified']).toBe('2026-04-15T12:00:00.000Z')
  })

  it('author Person includes @id equal to absolute profile URL when authorUrl is provided', () => {
    const schema = createPostSchema({
      ...baseArgs,
      kind: 'article',
      authorName: 'alice',
      authorUrl: '/user/alice',
    })

    expect(schema['author']).toEqual({
      '@type': 'Person',
      name: 'alice',
      '@id': 'https://voucha.ai/user/alice',
      url: 'https://voucha.ai/user/alice',
    })
  })

  it('author Person omits @id when authorUrl is not provided', () => {
    const schema = createPostSchema({
      ...baseArgs,
      kind: 'article',
      authorName: 'alice',
    })

    const author = schema['author'] as Record<string, unknown>
    expect(author['@type']).toBe('Person')
    expect(author).not.toHaveProperty('@id')
    expect(author).not.toHaveProperty('url')
  })
})
