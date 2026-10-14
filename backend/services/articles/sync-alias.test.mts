import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'
import { syncOwnedArticles } from '../../test-helpers/article-sync-fixtures.mts'
import { getPostByAny } from '@services/posts/get'

import { syncArticles } from './sync.mts'

describe('syncArticles aliases', () => {
  it('shares updated state between a post slug and UUID in file order', async () => {
    const user = await createTestUser({ administrator: true })
    const slug = `aliased-sync-${randomUUID()}`
    const ownedSlugs = new Set([slug])
    const files = [{ file: 'seed.md', key: 'articles/seed.md', cacheToken: 'seed:v1' }]
    const content = new Map([['seed.md', `---\ntitle: Seed\nslug: ${slug}\n---\nSeed body.`]])
    const sync = () =>
      syncOwnedArticles(ownedSlugs, () =>
        syncArticles(user, {
          listArticleMarkdownFiles: async () => files,
          getArticleMarkdown: async article => content.get(article.file)!,
        }),
      )

    expect((await sync()).results[0]?.action).toBe('created')
    const post = await getPostByAny(slug)
    expect(post).not.toBeNull()

    files.splice(
      0,
      files.length,
      { file: 'slug.md', key: 'articles/slug.md', cacheToken: 'slug:v1' },
      { file: 'uuid.md', key: 'articles/uuid.md', cacheToken: 'uuid:v1' },
    )
    content.set('slug.md', `---\ntitle: Changed\nslug: ${slug}\n---\nChanged body.`)
    content.set('uuid.md', `---\ntitle: Changed\nslug: ${post!.id}\n---\nChanged body.`)

    const { result, queries } = await withCapturedTestQueries(sync)

    expect(countCapturedQueriesByAnnotation(queries, 'prefetchArticlePosts')).toBe(1)
    expect(result.results.map(item => item.action)).toEqual(['updated', 'skipped'])
    expect((await getPostByAny(slug))?.markdown).toBe('Changed body.')
  })
})
