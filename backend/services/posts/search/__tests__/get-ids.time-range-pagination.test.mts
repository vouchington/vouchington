import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  deleteTestPost,
  insertTestPost,
} from '@voucha/test-helpers'
import { getPostIds } from '../get-ids.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('getPostIds paging within a time range', () => {
  it('continues from a page-one cursor inside the selected range and never leaves it', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create time-range test user')
    const suffix = createRandomString(10)
    const insert = (label: string, ageDays: number) =>
      insertTestPost({
        createdAt: new Date(Date.now() - ageDays * DAY_MS),
        title: `${label} ${suffix}`,
        slug: `${label}-${suffix}`,
        createdById: user.id,
        markdown: `${label} ${suffix}`,
        postType: 'topic_recommendation',
      })
    const [newerId, olderId, monthOldId, yearOldId] = await Promise.all([
      insert('newer', 1),
      insert('older', 3),
      insert('month', 20),
      insert('year', 200),
    ])
    try {
      const base = {
        user_id: user.id,
        include_topic_recommendations: true,
        post_types: ['topic_recommendation' as const],
        sort: 'new' as const,
        limit: 1,
      }

      const week1 = await getPostIds(undefined, { ...base, time_range: '1w' })
      expect(week1.results.map(r => r.id)).toEqual([newerId])
      expect(week1.page_info.end_cursor).not.toBeNull()
      const week2 = await getPostIds(undefined, {
        ...base,
        time_range: '1w',
        after: week1.page_info.end_cursor ?? undefined,
      })
      expect(week2.results.map(r => r.id)).toEqual([olderId])
      expect(week2.page_info.has_next_page).toBe(false)

      const year1 = await getPostIds(undefined, { ...base, limit: 2, time_range: '1y' })
      expect(year1.results.map(r => r.id)).toEqual([newerId, olderId])
      const year2 = await getPostIds(undefined, {
        ...base,
        limit: 2,
        time_range: '1y',
        after: year1.page_info.end_cursor ?? undefined,
      })
      expect(year2.results.map(r => r.id)).toEqual([monthOldId, yearOldId])
    } finally {
      await Promise.all([newerId, olderId, monthOldId, yearOldId].map(id => deleteTestPost(id)))
    }
  })
})
