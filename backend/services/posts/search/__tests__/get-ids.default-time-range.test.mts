import { describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  deleteTestPost,
  insertTestPost,
  setPostVotesScoreUp,
} from '@voucha/test-helpers'
import { getPostIds } from '../get-ids.mts'
import type { PostSearchOptions } from '../types.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('getPostIds default time range', () => {
  it('leaves an omitted time_range unfiltered and honors an explicit range', async () => {
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
      await Promise.all([setPostVotesScoreUp(recentId, 1), setPostVotesScoreUp(oldId, 1)])
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
        expect(await ids({ ...base, sort })).toEqual(both)
      }
      expect(await ids({ ...base, sort: 'new', time_range: '1w' })).toEqual([recentId])
      expect(await ids({ ...base, sort: 'new', time_range: '1y' })).toEqual(both)
      expect(await ids({ ...base, sort: 'new', time_range: 'all' })).toEqual(both)

      const page = await getPostIds(undefined, { ...base, sort: 'new' })
      const cursor = page.page_info.start_cursor
      expect(cursor).toBeTruthy()
      expect(
        (
          await getPostIds(undefined, { ...base, sort: 'new', after: cursor ?? undefined })
        ).results.map(result => result.id),
      ).toEqual([oldId])
      await expect(
        getPostIds(undefined, {
          ...base,
          sort: 'new',
          time_range: '1w',
          after: cursor ?? undefined,
        }),
      ).rejects.toMatchObject({ status: 400, message: 'Invalid cursor for sort=new' })
      await expect(
        getPostIds(undefined, { ...base, sort: 'best', after: cursor ?? undefined }),
      ).rejects.toMatchObject({ status: 400, message: 'Invalid cursor for sort=best' })
      await expect(
        getPostIds(undefined, {
          ...base,
          sort: 'new',
          time_range: 'all',
          after: cursor ?? undefined,
        }),
      ).rejects.toMatchObject({ status: 400, message: 'Invalid cursor for sort=new' })
    } finally {
      await Promise.all([deleteTestPost(recentId), deleteTestPost(oldId)])
    }
  })

  it('does not treat an author drafts listing as an age opt-out', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create time-range test user')
    const suffix = createRandomString(10)
    const oldId = await insertTestPost({
      createdAt: new Date(Date.now() - 40 * DAY_MS),
      title: `old draft ${suffix}`,
      slug: `old-draft-${suffix}`,
      createdById: user.id,
      markdown: `old draft ${suffix}`,
      postType: 'topic_recommendation',
    })
    try {
      const base = {
        user_id: user.id,
        include_topic_recommendations: true,
        post_types: ['topic_recommendation' as const],
        limit: 10,
      }
      const ids = async (options: PostSearchOptions) =>
        (await getPostIds(user, options)).results.map(result => result.id)

      expect(await ids({ ...base, drafts: true })).toEqual([oldId])
      expect(await ids(base)).toEqual([oldId])
      expect(await ids({ ...base, drafts: true, time_range: '1w' })).toEqual([])
    } finally {
      await deleteTestPost(oldId)
    }
  })

  it('keeps an explicit finite range on the first page decision time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = new Date('2026-06-15T12:00:00.000Z')
    vi.setSystemTime(start)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create time-range test user')
    const suffix = createRandomString(10)
    const insert = (label: string, ageDays: number) =>
      insertTestPost({
        createdAt: new Date(start.getTime() - ageDays * DAY_MS),
        title: `${label} ${suffix}`,
        slug: `${label}-${suffix}`,
        createdById: user.id,
        markdown: `${label} ${suffix}`,
        postType: 'topic_recommendation',
      })
    const newerId = await insert('newer-bound', 6.5)
    const olderId = await insert('older-bound', 6.9)
    try {
      const base = {
        user_id: user.id,
        include_topic_recommendations: true,
        post_types: ['topic_recommendation' as const],
        sort: 'new' as const,
        time_range: '1w' as const,
        limit: 1,
      }
      const first = await getPostIds(undefined, base)
      expect(first.results.map(result => result.id)).toEqual([newerId])
      expect(first.page_info.end_cursor).toBeTruthy()
      vi.setSystemTime(start.getTime() + 2 * DAY_MS)
      const second = await getPostIds(undefined, {
        ...base,
        after: first.page_info.end_cursor ?? undefined,
      })
      expect(second.results.map(result => result.id)).toEqual([olderId])
    } finally {
      vi.useRealTimers()
      await Promise.all([deleteTestPost(newerId), deleteTestPost(olderId)])
    }
  })
})
