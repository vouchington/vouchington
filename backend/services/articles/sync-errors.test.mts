import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'

import { syncArticles } from './sync.mts'

describe('syncArticles errors', () => {
  it('reports invalid slugs and a failed prefetch in file order', async () => {
    const currentUser = await createTestUser({ administrator: true })
    const firstSlug = `first-${randomUUID()}`
    const lastSlug = `last-${randomUUID()}`
    const markdown = new Map([
      ['first.md', `---\ntitle: First\nslug: ${firstSlug}\n---\nFirst body.`],
      ['invalid.md', '---\ntitle: Invalid\nslug: bad slug\n---\nInvalid body.'],
      ['last.md', `---\ntitle: Last\nslug: ${lastSlug}\n---\nLast body.`],
    ])
    const files = [...markdown.keys()].map(file => ({
      file,
      key: `articles/${file}`,
      cacheToken: `${file}:v1`,
    }))

    const result = await syncArticles(currentUser, {
      listArticleMarkdownFiles: async () => files,
      getArticleMarkdown: async article => markdown.get(article.file)!,
      prefetchPosts: async slugs => {
        expect(slugs).toEqual([firstSlug, lastSlug])
        throw new Error('Post lookup failed')
      },
    })

    expect(result.results.map(item => item.file)).toEqual(['first.md', 'invalid.md', 'last.md'])
    expect(result.results.map(item => item.error)).toEqual([
      'Post lookup failed',
      'Invalid post id or slug',
      'Post lookup failed',
    ])
    expect(result.summary).toMatchObject({ created: 0, updated: 0, errored: 3 })
  })
})
