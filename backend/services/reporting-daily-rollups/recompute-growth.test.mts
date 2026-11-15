import { describe, expect, it } from 'vitest'
import { createTestUser, hardDeleteTestPost, insertTestPost } from '@voucha/test-helpers'
import {
  readTestGrowthAuthor,
  readTestReportingSourceChanges,
  recomputeTestGrowthDay,
} from '@voucha/test-helpers/reporting-daily-rollups'

describe('reporting daily recomputation', () => {
  it('replaces completed-day author membership and retains a recoverable day after physical source deletion', async () => {
    const author = await createTestUser()
    const date = new Date(Date.now() - 2 * 86_400_000)
    date.setUTCHours(12, 0, 0, 0)
    const day = date.toISOString().slice(0, 10)
    const id = await insertTestPost({
      title: 'Reporting source loss',
      slug: `reporting-source-${crypto.randomUUID()}`,
      markdown: 'A completed-day contribution.',
      createdById: author.id,
      createdAt: date,
    })
    await recomputeTestGrowthDay(day)
    expect(await readTestGrowthAuthor(day, author.id)).toBe(true)
    const before = await readTestReportingSourceChanges(day, 'post_deletion')
    await hardDeleteTestPost(id)
    expect(await readTestReportingSourceChanges(day, 'post_deletion')).toBeGreaterThan(before)
    await recomputeTestGrowthDay(day)
    expect(await readTestGrowthAuthor(day, author.id)).toBe(false)
  })

  it('preserves the strict UUID lower boundary even when the range begins at midnight', async () => {
    const { getMinUUIDv7ForDate, getMaxUUIDv7ForDate } = await import('@modules/utils')
    const { getContentProduction } = await import('../growth-metrics/get-content-production.mts')
    const lowerAuthor = await createTestUser()
    const upperAuthor = await createTestUser()
    const date = new Date(Date.UTC(2200, 0, 1 + crypto.getRandomValues(new Uint8Array(1))[0]!))
    const before = await getContentProduction('all', date)
    const ids: string[] = []
    try {
      for (const [id, author] of [
        [getMinUUIDv7ForDate(date), lowerAuthor],
        [getMaxUUIDv7ForDate(date), upperAuthor],
      ] as const) {
        ids.push(
          await insertTestPost({
            id,
            title: 'Exact reporting boundary',
            slug: `reporting-boundary-${crypto.randomUUID()}`,
            markdown: 'Synthetic UUID boundary.',
            createdById: author.id,
          }),
        )
      }
      const after = await getContentProduction('all', date)
      expect(after.total_posts).toBe(before.total_posts + 1)
    } finally {
      for (const id of ids) await hardDeleteTestPost(id)
    }
  })

  it('records a newly inserted historical follow day after that day could already have been materialized', async () => {
    const { insertTestHistoricalReportingFollow } =
      await import('@voucha/test-helpers/reporting-daily-rollups')
    const subject = await createTestUser()
    const object = await createTestUser()
    const createdAt = new Date(Date.now() - 20 * 86_400_000)
    const day = createdAt.toISOString().slice(0, 10)
    const before = await readTestReportingSourceChanges(day, 'user_follow')
    await insertTestHistoricalReportingFollow(subject.id, object.id, createdAt)
    expect(await readTestReportingSourceChanges(day, 'user_follow')).toBeGreaterThan(before)
  })
})
