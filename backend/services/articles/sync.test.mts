import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { getPostByAny } from '@services/posts/get'

import { syncArticles, syncLocalArticles } from './sync.mts'
import type { ArticleMarkdownFile } from './storage.mts'

const articleFixtures = new Map([
  [
    'about.md',
    `---
title: About Voucha
slug: about
post_type: article
---
# About Voucha

About body.`,
  ],
  [
    'keyboard-shortcuts.md',
    `---
title: Keyboard Shortcuts
slug: keyboard-shortcuts
post_type: article
---
# Keyboard Shortcuts

Shortcut body.`,
  ],
])

describe('syncArticles', () => {
  let adminUser: PrivateUser
  const listArticleMarkdownFiles = vi.fn<() => Promise<ArticleMarkdownFile[]>>()
  const getArticleMarkdown = vi.fn<(article: ArticleMarkdownFile) => Promise<string>>()

  function syncFixtureArticles() {
    return syncArticles(adminUser, { listArticleMarkdownFiles, getArticleMarkdown })
  }

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    listArticleMarkdownFiles.mockResolvedValue(
      [...articleFixtures.keys()].map(file => ({
        file,
        key: `articles/${file}`,
        cacheToken: `${file}:v1`,
      })),
    )
    getArticleMarkdown.mockImplementation(article => {
      const content = articleFixtures.get(article.file)
      if (!content) throw new Error(`Missing fixture for ${article.file}`)
      return Promise.resolve(content)
    })
  })

  it('syncs articles from markdown files', async () => {
    const result = await syncFixtureArticles()

    expect(result.summary.errored).toBe(0)
    expect(result.results).toHaveLength(articleFixtures.size)

    for (const item of result.results) {
      expect(['created', 'updated', 'skipped']).toContain(item.action)
      expect(item.slug).toBeTruthy()
      expect(item.file).toMatch(/\.md$/)
    }
  })

  it('skips all articles on second sync (idempotency)', async () => {
    await syncFixtureArticles()

    const result = await syncFixtureArticles()

    expect(result.summary.errored).toBe(0)

    for (const item of result.results) {
      expect(item.action).toBe('skipped')
    }
  })

  it('creates the about article with correct title', async () => {
    await syncFixtureArticles()

    const post = await getPostByAny('about')
    expect(post).not.toBeNull()
    expect(post!.title).toBe('About Voucha')
    expect(post!.post_type).toBe('article')
  })

  it('does not update post timestamps for skipped (unchanged) articles', async () => {
    // Ensure the about article exists
    await syncFixtureArticles()

    const postBefore = await getPostByAny('about')
    expect(postBefore).not.toBeNull()
    const updatedAtBefore = postBefore!.updated_at

    // Second sync: should skip all unchanged articles
    const result = await syncFixtureArticles()

    const skipped = result.results.filter(r => r.action === 'skipped')
    expect(skipped.length).toBeGreaterThan(0)

    // updated_at must not change for skipped articles
    const postAfter = await getPostByAny('about')
    expect(postAfter!.updated_at).toEqual(updatedAtBefore)
  })

  it('reports an error for unreadable article objects and continues syncing', async () => {
    await syncFixtureArticles()

    getArticleMarkdown.mockImplementation(article => {
      if (article.file === 'about.md') return Promise.reject(new Error('S3 read failed'))
      const content = articleFixtures.get(article.file)
      if (!content) throw new Error(`Missing fixture for ${article.file}`)
      return Promise.resolve(content)
    })

    const result = await syncFixtureArticles()

    expect(result.summary.errored).toBe(1)
    expect(result.results.find(item => item.file === 'about.md')).toMatchObject({
      action: 'error',
      error: 'S3 read failed',
    })
    expect(result.results.find(item => item.file === 'keyboard-shortcuts.md')?.action).toBe(
      'skipped',
    )
  })

  it('waits for each article before loading the next and preserves error result order', async () => {
    const firstLoad = Promise.withResolvers<string>()
    listArticleMarkdownFiles.mockResolvedValue([
      { file: 'first.md', key: 'articles/first.md', cacheToken: 'first:v1' },
      { file: 'about.md', key: 'articles/about.md', cacheToken: 'about:v1' },
    ])
    getArticleMarkdown.mockImplementation(article => {
      if (article.file === 'first.md') return firstLoad.promise
      return Promise.resolve(articleFixtures.get(article.file)!)
    })

    const syncPromise = syncFixtureArticles()
    await vi.waitFor(() => expect(getArticleMarkdown).toHaveBeenCalledOnce())
    expect(getArticleMarkdown).toHaveBeenLastCalledWith(
      expect.objectContaining({ file: 'first.md' }),
    )

    firstLoad.reject(new Error('first load failed'))
    const result = await syncPromise

    expect(getArticleMarkdown).toHaveBeenCalledTimes(2)
    expect(result.results.map(item => item.file)).toEqual(['first.md', 'about.md'])
    expect(result.results[0]).toMatchObject({ action: 'error', error: 'first load failed' })
  })

  it('syncs local article markdown from a filesystem directory for seed setup', async () => {
    const articlesDir = await mkdtemp(join(tmpdir(), 'articles-sync-'))
    const slug = `local-seed-${randomUUID()}`

    try {
      await writeFile(join(articlesDir, 'README.md'), '# Ignore me\n')
      await writeFile(
        join(articlesDir, 'local-seed.md'),
        `---
title: Local Seed
slug: ${slug}
post_type: article
---
# Local Seed

Local seed body.`,
      )

      const result = await syncLocalArticles(adminUser, articlesDir)

      expect(result.summary).toMatchObject({ created: 1, errored: 0 })
      expect(result.results).toEqual([{ action: 'created', file: 'local-seed.md', slug }])

      const post = await getPostByAny(slug)
      expect(post).not.toBeNull()
      expect(post!.title).toBe('Local Seed')
    } finally {
      await rm(articlesDir, { force: true, recursive: true })
    }
  })
})
