import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { getCommunityPostsPage } from './posts-page.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('getCommunityPostsPage time range', () => {
  async function communityWithAges(ageDays: number[]) {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const postIds: string[] = []
    for (const age of ageDays) {
      const postId = await insertTestPost({
        communityId: community.id,
        createdAt: new Date(Date.now() - age * DAY_MS),
        createdById: owner.id,
        markdown: `Time range body ${age}`,
        slug: `time-range-${createRandomString(8)}`,
        title: `Time range ${age}`,
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: owner.id,
      })
      postIds.push(postId)
    }
    return { community, postIds }
  }

  it('reads only the last 30 days for every sort when no range is sent', async () => {
    const { community, postIds } = await communityWithAges([2, 40])
    for (const sort of ['new', 'hot'] as const) {
      const page = await getCommunityPostsPage(community.id, { currentUser: null, sort })
      expect(page.results.map(post => post.id)).toEqual([postIds[0]])
    }
  })

  it('honors an explicit range and lets all read the full history', async () => {
    const { community, postIds } = await communityWithAges([2, 20, 400])
    const ids = async (time_range: '1w' | '1y' | 'all') =>
      (await getCommunityPostsPage(community.id, { currentUser: null, time_range })).results.map(
        post => post.id,
      )

    expect(await ids('1w')).toEqual([postIds[0]])
    expect(await ids('1y')).toEqual([postIds[0], postIds[1]])
    expect(await ids('all')).toEqual([postIds[0], postIds[1], postIds[2]])
  })

  it('pages with a cursor inside the selected range and never leaves it', async () => {
    const { community, postIds } = await communityWithAges([1, 3, 40, 400])
    const first = await getCommunityPostsPage(community.id, {
      currentUser: null,
      time_range: '1y',
      limit: 2,
    })
    const second = await getCommunityPostsPage(community.id, {
      currentUser: null,
      time_range: '1y',
      limit: 2,
      after: first.page_info.end_cursor!,
    })

    expect(first.results.map(post => post.id)).toEqual([postIds[0], postIds[1]])
    expect(first.page_info.has_next_page).toBe(true)
    expect(second.results.map(post => post.id)).toEqual([postIds[2]])
    expect(second.page_info.has_next_page).toBe(false)
  })
})
