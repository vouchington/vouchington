import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { getAnonymousCacheGeneration } from '../entity-cache/anonymous-cache-generation.mts'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'
import { searchOmnisearch } from './omnisearch.mts'

describe('anonymous omnisearch cache', () => {
  it('reuses the cached post result and body without a public eligibility recheck', async () => {
    const suffix = randomUUID().replaceAll('-', '')
    const term = `omnicache${suffix}`
    const title = `${term} post title`
    const user = await createTestUserDirect()
    const postId = await insertTestPost({
      title,
      slug: `omni-cache-${suffix}`,
      createdById: user.id,
      markdown: `Unique omnisearch body ${suffix}`,
    })
    const options = { textSearchQuery: term, limit: 3 }
    const generationBefore = await getAnonymousCacheGeneration()
    const first = await withCapturedTestQueries(() => searchOmnisearch(options))
    const second = await withCapturedTestQueries(() => searchOmnisearch(options))
    const generationAfter = await getAnonymousCacheGeneration()

    for (const read of [first, second]) {
      expect(read.result.posts).toContainEqual(expect.objectContaining({ id: postId, title }))
      expect(
        read.queries.filter(query =>
          /\/\* (?:getPublicPostIds|canViewPostsBatch) \*\//.test(query.text),
        ),
      ).toEqual([])
    }
    expect(
      countCapturedQueriesByAnnotation(first.queries, 'getAnonymousPostRowsByAnyBatch'),
    ).toBeGreaterThan(0)
    const stableGeneration = generationBefore === generationAfter
    const snapshotQueries = countCapturedQueriesByAnnotation(
      second.queries,
      'getAnonymousPostRowsByAnyBatch',
    )
    const searchQueries = countCapturedQueriesByAnnotation(second.queries, 'buildPostSearchQuery')
    expect(stableGeneration ? snapshotQueries : 0).toBe(0)
    expect(stableGeneration ? searchQueries : 0).toBe(0)
  })
})
