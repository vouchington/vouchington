import { randomUUID } from 'node:crypto'

import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { rejectPostgresReadForTest } from '@voucha/test-helpers/injected-failures'

import { useArticleBucket } from '../../test-helpers/article-sync-fixtures.mts'
import { syncArticles } from './sync.mts'
import { articlesWorkConfig } from './work-limits.mts'

function rejectArticlePrefetch(): string[][] {
  const lookups: string[][] = []
  onTestFinished(
    rejectPostgresReadForTest('prefetchArticlePosts', new Error('Post lookup failed'), values => {
      lookups.push(values[0] as string[])
    }),
  )
  return lookups
}

describe('syncArticles errors', () => {
  it('reports invalid slugs and a failed prefetch in file order', async () => {
    const currentUser = await createTestUser({ administrator: true })
    const firstSlug = `first-${randomUUID()}`
    const lastSlug = `last-${randomUUID()}`
    await useArticleBucket([
      ['first.md', `---\ntitle: First\nslug: ${firstSlug}\n---\nFirst body.`],
      ['invalid.md', '---\ntitle: Invalid\nslug: bad slug\n---\nInvalid body.'],
      ['last.md', `---\ntitle: Last\nslug: ${lastSlug}\n---\nLast body.`],
    ])
    const lookups = rejectArticlePrefetch()

    const result = await syncArticles(currentUser)

    expect(lookups).toEqual([[firstSlug, lastSlug]])
    expect(result.results.map(item => item.file)).toEqual(['first.md', 'invalid.md', 'last.md'])
    expect(result.results.map(item => item.error)).toEqual([
      'Post lookup failed',
      'Invalid post id or slug',
      'Post lookup failed',
    ])
    expect(result.summary).toMatchObject({ created: 0, updated: 0, errored: 3 })
  })

  it('prepares bounded batches and continues after a lookup failure', async () => {
    const currentUser = await createTestUser({ administrator: true })
    const files = Array.from(
      { length: 51 },
      (_, index) => `article-${String(index).padStart(2, '0')}.md`,
    )
    await useArticleBucket(
      files.map(file => [file, `---\ntitle: Article\nslug: ${file.slice(0, -3)}\n---\nBody.`]),
    )
    const lookups = rejectArticlePrefetch()

    const result = await syncArticles(currentUser)

    expect(lookups.map(batch => batch.length)).toEqual([50, 1])
    expect(result.results.map(item => item.file)).toEqual(files)
    expect(result.summary).toMatchObject({ created: 0, updated: 0, errored: 51 })
  })

  it('uses the runtime article batch bound for the whole sync', async () => {
    const currentUser = await createTestUser({ administrator: true })
    const files = ['a-one.md', 'b-two.md', 'c-three.md']
    await useArticleBucket(
      files.map(file => [file, `---\ntitle: Article\nslug: ${file.slice(0, -3)}\n---\nBody.`]),
    )
    await articlesWorkConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(articlesWorkConfig, { sync_batch_size: 2 }))
    const lookups = rejectArticlePrefetch()

    const result = await syncArticles(currentUser)

    expect(lookups).toEqual([['a-one', 'b-two'], ['c-three']])
    expect(result.results.map(item => item.file)).toEqual(files)
  })
})
