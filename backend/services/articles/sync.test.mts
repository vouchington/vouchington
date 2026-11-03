import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { getPostByAny } from '@services/posts/get'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'
import {
  createArticleSyncFixtures,
  seedArticleSyncTimestamp,
  stubArticleBucket,
  syncOwnedArticles,
  type ArticleBucketObject,
} from '../../test-helpers/article-sync-fixtures.mts'
import { drainOwnedTestAction } from '../../test-helpers/post-commit-completion.mts'

import { syncArticles, syncLocalArticles } from './sync.mts'

describe('syncArticles', () => {
  let adminUser: PrivateUser
  let articleFixtures = new Map<string, string>()
  let aboutSlug = ''
  let keyboardSlug = ''
  let ownedSlugs = new Set<string>()
  let objects = new Map<string, ArticleBucketObject>()
  let fetchedKeys: string[] = []

  function syncFixtureArticles(release: () => void = () => {}) {
    return syncOwnedArticles(ownedSlugs, () => syncArticles(adminUser), release)
  }

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
  })

  beforeEach(() => {
    const fixtures = createArticleSyncFixtures()
    articleFixtures = fixtures.articles
    aboutSlug = fixtures.aboutSlug
    keyboardSlug = fixtures.keyboardSlug
    ownedSlugs = new Set([aboutSlug, keyboardSlug])
    objects = new Map<string, ArticleBucketObject>(articleFixtures)
    ;({ fetchedKeys } = stubArticleBucket(objects))
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

  it('prefetches distinct slugs once and processes duplicate slugs in file order', async () => {
    const slug = `ordered-sync-${randomUUID()}`
    ownedSlugs = new Set([slug, keyboardSlug])
    objects.clear()
    objects.set('a-first.md', `---\ntitle: First\nslug: ${slug}\n---\nFirst body.`)
    objects.set('b-second.md', `---\ntitle: Second\nslug: ${slug}\n---\nSecond body.`)
    objects.set('c-third.md', `---\ntitle: Second\nslug: ${slug}\n---\nSecond body.`)
    objects.set('d-keyboard-shortcuts.md', articleFixtures.get('keyboard-shortcuts.md')!)

    const { result, queries } = await withCapturedTestQueries(() => syncFixtureArticles())

    expect(countCapturedQueriesByAnnotation(queries, 'prefetchArticlePosts')).toBe(1)
    expect(result.results.map(item => item.action)).toEqual([
      'created',
      'updated',
      'skipped',
      'created',
    ])
    expect((await getPostByAny(slug))?.title).toBe('Second')
  })

  describe('relative article links', () => {
    let slug = ''
    const articleWith = (body: string) => `---\ntitle: Relative Links\nslug: ${slug}\n---\n${body}`

    beforeEach(() => {
      slug = `relative-links-${randomUUID()}`
    })

    function syncOnly(content: string) {
      ownedSlugs.add(slug)
      objects.clear()
      objects.set('relative.md', content)
      return syncFixtureArticles()
    }

    it('stores ./slug.md links as /article/slug and skips the unchanged re-sync', async () => {
      const authored = articleWith(
        'See [DMCA](./copyright-and-dmca.md#notice) and [guide](guide.md).',
      )

      expect((await syncOnly(authored)).results[0]?.action).toBe('created')
      expect((await getPostByAny(slug))?.markdown).toBe(
        'See [DMCA](/article/copyright-and-dmca#notice) and [guide](/article/guide).',
      )
      expect((await syncOnly(authored)).results[0]?.action).toBe('skipped')
    })

    it('rewrites links when an existing article is updated', async () => {
      await syncOnly(articleWith('No links yet.'))

      const result = await syncOnly(articleWith('Now [linked](./cookie-policy.md).'))

      expect(result.results[0]?.action).toBe('updated')
      expect((await getPostByAny(slug))?.markdown).toBe('Now [linked](/article/cookie-policy).')
    })
  })

  it('creates the about article with correct title', async () => {
    await syncFixtureArticles()

    const post = await getPostByAny(aboutSlug)
    expect(post).not.toBeNull()
    expect(post!.slug).toBe(aboutSlug)
    expect(post!.title).toBe('About Voucha')
    expect(post!.post_type).toBe('article')
  })

  it('does not update post timestamps for skipped (unchanged) articles', async () => {
    // Ensure the about article exists
    await syncFixtureArticles()

    const postBefore = await getPostByAny(aboutSlug)
    expect(postBefore).not.toBeNull()
    const updatedAtBefore = new Date('2000-01-01T00:00:00.000Z')
    await seedArticleSyncTimestamp(postBefore!.id, updatedAtBefore)
    expect((await getPostByAny(postBefore!.id))!.updated_at).toEqual(updatedAtBefore)

    // Second sync: should skip all unchanged articles
    const result = await syncFixtureArticles()

    const skipped = result.results.filter(r => r.action === 'skipped')
    expect(skipped.length).toBeGreaterThan(0)
    expect(result.summary).toMatchObject({
      skipped: articleFixtures.size,
      created: 0,
      updated: 0,
      errored: 0,
    })

    // updated_at must not change for skipped articles
    const postAfter = await getPostByAny(postBefore!.id)
    expect(postAfter!.updated_at).toEqual(updatedAtBefore)
  })

  it('reports an error for unreadable article objects and continues syncing', async () => {
    await syncFixtureArticles()

    objects.set('about.md', new Error('S3 read failed'))

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
    const firstRequested = Promise.withResolvers<void>()
    objects.clear()
    objects.set('aa-first.md', () => {
      firstRequested.resolve()
      return firstLoad.promise
    })
    objects.set('about.md', articleFixtures.get('about.md')!)

    const syncPromise = () =>
      syncFixtureArticles(() => firstLoad.reject(new Error('first load failed')))
    const result = await drainOwnedTestAction(
      syncPromise,
      () => firstLoad.reject(new Error('first load failed')),
      async () => {
        await firstRequested.promise
        expect(fetchedKeys).toEqual(['articles/aa-first.md'])
      },
    )

    expect(fetchedKeys).toEqual(['articles/aa-first.md', 'articles/about.md'])
    expect(result.results.map(item => item.file)).toEqual(['aa-first.md', 'about.md'])
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

      const result = await syncOwnedArticles(new Set([slug]), () =>
        syncLocalArticles(adminUser, articlesDir),
      )

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
