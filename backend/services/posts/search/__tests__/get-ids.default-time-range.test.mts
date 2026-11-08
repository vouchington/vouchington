import { describe, expect, it } from 'vitest'
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
        postType: 'discussion',
      })
    const [recentId, oldId] = await Promise.all([insert('recent', 2), insert('old', 40)])
    try {
      await Promise.all([setPostVotesScoreUp(recentId, 1000), setPostVotesScoreUp(oldId, 1000)])
      const base = {
        user_id: user.id,
        post_types: ['discussion' as const],
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

  it('keeps the full history for a user listing their own drafts without time_range', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create time-range test user')
    const suffix = createRandomString(10)
    const oldId = await insertTestPost({
      createdAt: new Date(Date.now() - 40 * DAY_MS),
      title: `old draft ${suffix}`,
      slug: `old-draft-${suffix}`,
      createdById: user.id,
      markdown: `old draft ${suffix}`,
      postType: 'discussion',
    })
    try {
      const base = {
        user_id: user.id,
        post_types: ['discussion' as const],
        limit: 10,
      }
      const ids = async (options: PostSearchOptions) =>
        (await getPostIds(user, options)).results.map(result => result.id)

      expect(await ids({ ...base, drafts: true })).toEqual([oldId])
      expect(await ids(base)).toEqual([])
    } finally {
      await deleteTestPost(oldId)
    }
  })

  it('keeps the 30-day bound when drafts is not the author listing their own posts', async () => {
    const author = await createTestUserDirect()
    const other = await createTestUserDirect()
    if (!author || !other) throw new Error('Failed to create time-range test users')
    const suffix = createRandomString(10)
    const insert = (label: string, ageDays: number) =>
      insertTestPost({
        createdAt: new Date(Date.now() - ageDays * DAY_MS),
        title: `${label} ${suffix}`,
        slug: `${label}-${suffix}`,
        createdById: author.id,
        markdown: `${label} ${suffix}`,
        postType: 'discussion',
      })
    const [recentId, oldId] = await Promise.all([
      insert('recent-drafts', 2),
      insert('old-drafts', 40),
    ])
    try {
      const base = {
        user_id: author.id,
        post_types: ['discussion' as const],
        drafts: true,
        limit: 10,
      }
      const ids = async (viewer: typeof author | undefined, options: PostSearchOptions = base) =>
        (await getPostIds(viewer, options)).results.map(result => result.id).toSorted()
      const both = [oldId, recentId].toSorted()

      expect(await ids(undefined)).toEqual([recentId])
      expect(await ids(other)).toEqual([recentId])
      expect(await ids(author)).toEqual(both)
      expect(await ids(undefined, { ...base, time_range: 'all' })).toEqual(both)
    } finally {
      await Promise.all([deleteTestPost(recentId), deleteTestPost(oldId)])
    }
  })
})
