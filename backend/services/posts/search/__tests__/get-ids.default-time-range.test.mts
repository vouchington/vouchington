import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  deleteTestPost,
  insertTestPost,
} from '@voucha/test-helpers'
import { getPostIds } from '../get-ids.mts'
import type { PostSearchOptions } from '../types.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('getPostIds default time range', () => {
  it('bounds a request without time_range to 30 days for every sort and honors an explicit range', async () => {
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
    const [recentId, oldId] = await Promise.all([insert('recent', 2), insert('old', 40)])
    try {
      const base = {
        user_id: user.id,
        include_topic_recommendations: true,
        post_types: ['topic_recommendation' as const],
        limit: 10,
      }
      const ids = async (options: PostSearchOptions) =>
        (await getPostIds(undefined, options)).results.map(result => result.id).toSorted()
      const both = [oldId, recentId].toSorted()

      for (const sort of ['new', 'best', 'hot'] as const) {
        expect(await ids({ ...base, sort })).toEqual([recentId])
      }
      expect(await ids({ ...base, sort: 'new', time_range: '1w' })).toEqual([recentId])
      expect(await ids({ ...base, sort: 'new', time_range: '1y' })).toEqual(both)
      expect(await ids({ ...base, sort: 'new', time_range: 'all' })).toEqual(both)
    } finally {
      await Promise.all([deleteTestPost(recentId), deleteTestPost(oldId)])
    }
  })
})
