import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'

describe('GET /api/v1/communities/:slug/posts time range', () => {
  it('bounds the list to 30 days, honors time_range, and rejects unknown ranges', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `posts-range-${createRandomString(8)}`,
      visibility: 'public',
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'owner',
    })
    const ids: string[] = []
    for (const age of [2, 40]) {
      const id = await insertTestPost({
        communityId: community.id,
        createdAt: new Date(Date.now() - age * 24 * 60 * 60 * 1000),
        createdById: user.id,
        markdown: `Range body ${age}`,
        slug: `range-${age}-${createRandomString(8)}`,
        title: `Range ${age}`,
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId: id,
        submittedById: user.id,
      })
      ids.push(id)
    }
    const request = createRequest()
    const list = async (query: string) =>
      (
        (await request.get(`/api/v1/communities/${community.slug}/posts${query}`).expect(200)).body
          .results as { id: string }[]
      ).map(item => item.id)

    expect(await list('')).toEqual([ids[0]])
    expect(await list('?sort=hot')).toEqual([ids[0]])
    expect(await list('?time_range=1y')).toEqual([ids[0], ids[1]])
    expect(await list('?time_range=all')).toEqual([ids[0], ids[1]])
    await request.get(`/api/v1/communities/${community.slug}/posts?time_range=2d`).expect(422)
  })
})
