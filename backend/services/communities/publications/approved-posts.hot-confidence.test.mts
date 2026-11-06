import { describe, expect, it } from 'vitest'
import { decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
  setTestPostVoteScores,
} from '@voucha/test-helpers'
import { searchCommunityPosts } from './approved-posts.mts'

async function createFixture() {
  const owner = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner.id })
  async function post(up: number, down: number, createdAt: Date) {
    const suffix = createRandomString(10)
    const id = await insertTestPost({
      title: `Community hot ${suffix}`,
      slug: `community-hot-${suffix}`,
      markdown: 'Community hot ranking fixture',
      communityId: community.id,
      createdById: owner.id,
      createdAt,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: id,
      submittedById: owner.id,
    })
    await setTestPostVoteScores(id, up, down)
    return id
  }
  return { communityId: community.id, post }
}

describe('community hot ranking', () => {
  it('ranks by confidence and paginates positive net support including rounded-zero confidence', async () => {
    const { communityId, post } = await createFixture()
    const timestamp = new Date('2026-01-01T00:00:00Z')
    const [confidence, net, zero, negative, tiny] = await Promise.all([
      post(5, 0, timestamp),
      post(100, 90, timestamp),
      post(1, 1, timestamp),
      post(1, 2, timestamp),
      post(1e-16, 0, timestamp),
    ])
    const first = await searchCommunityPosts(communityId, { sort: 'hot', limit: 1 })
    expect(first.results.map(row => row.id)).toEqual([confidence])
    const second = await searchCommunityPosts(communityId, {
      sort: 'hot',
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(second.results.map(row => row.id)).toEqual([net])
    const third = await searchCommunityPosts(communityId, {
      sort: 'hot',
      limit: 1,
      after: second.page_info.end_cursor!,
    })
    expect(third.results.map(row => row.id)).toEqual([tiny])
    expect(third.page_info.has_next_page).toBe(false)
    const cursor = decodeUuidCursor(third.page_info.start_cursor!, isScoreCursor, 'Invalid cursor')
    expect(cursor.score).toBe(0)
    const newest = await searchCommunityPosts(communityId, { sort: 'new', limit: 10 })
    expect(newest.results.map(row => row.id).toSorted()).toEqual(
      [confidence, net, zero, negative, tiny].toSorted(),
    )
  })

  it('uses post id for score ties and still favors newer posts at equal confidence', async () => {
    const { communityId, post } = await createFixture()
    const at = new Date('2026-01-01T00:00:00Z')
    const [tieA, tieB, newer] = await Promise.all([
      post(1, 0, at),
      post(1, 0, at),
      post(1, 0, new Date('2026-01-02T00:00:00Z')),
    ])
    const expected = [newer, ...[tieA, tieB].toSorted().toReversed()]
    const first = await searchCommunityPosts(communityId, { sort: 'hot', limit: 2 })
    expect(first.results.map(row => row.id)).toEqual(expected.slice(0, 2))
    const second = await searchCommunityPosts(communityId, {
      sort: 'hot',
      limit: 2,
      after: first.page_info.end_cursor!,
    })
    expect(second.results.map(row => row.id)).toEqual(expected.slice(2))
    expect(second.page_info.has_next_page).toBe(false)
  })
})
