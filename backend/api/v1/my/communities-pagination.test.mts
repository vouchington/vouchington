import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  safeUsername,
} from '@voucha/test-helpers'

describe('GET /api/v1/my/communities pagination', () => {
  it('paginates memberships at the exact limit without duplicates', async () => {
    const user = await createTestUser({ username: safeUsername('my-communities-page') })
    const owner = await createTestUser({ username: safeUsername('my-communities-owner') })
    const communityIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const community = await insertTestCommunity({ createdById: owner.id })
      communityIds.push(community.id)
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        createdAt: new Date(Date.now() - (10 - index) * 10_000),
      })
    }

    const request = createRequest()
    await request.authenticateAs(user)
    const page1 = await request.get('/api/v1/my/communities?limit=2').expect(200)
    const page2 = await request
      .get(
        `/api/v1/my/communities?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const resultIds = [...page1.body.results, ...page2.body.results].map(
      (member: { community_id: string }) => member.community_id,
    )
    expect(resultIds).toEqual(communityIds)
    expect(new Set(resultIds).size).toBe(3)
  })

  it('rejects a malformed cursor', async () => {
    const user = await createTestUser({ username: safeUsername('my-communities-bad-cursor') })
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/my/communities?after=invalid').expect(400)
  })

  it('rejects a cursor scoped to another user', async () => {
    const owner = await createTestUser({ username: safeUsername('my-communities-scope-a') })
    const other = await createTestUser({ username: safeUsername('my-communities-scope-b') })
    const communityOwner = await createTestUser({
      username: safeUsername('my-communities-scope-owner'),
    })
    const communities = await Promise.all([
      insertTestCommunity({ createdById: communityOwner.id }),
      insertTestCommunity({ createdById: communityOwner.id }),
    ])
    await Promise.all(
      communities.map((community, index) =>
        insertTestCommunityMember({
          communityId: community.id,
          userId: owner.id,
          createdAt: new Date(Date.now() - (10 - index) * 10_000),
        }),
      ),
    )

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    const first = await ownerRequest.get('/api/v1/my/communities?limit=1').expect(200)

    const otherRequest = createRequest()
    await otherRequest.authenticateAs(other)
    await otherRequest
      .get(
        `/api/v1/my/communities?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('rejects a cursor scoped to the community-membership roster endpoint', async () => {
    const user = await createTestUser({
      username: safeUsername('my-communities-roster-scope'),
    })
    const owner = await createTestUser({
      username: safeUsername('my-communities-roster-owner'),
    })
    const communities = await Promise.all([
      insertTestCommunity({ createdById: owner.id }),
      insertTestCommunity({ createdById: owner.id }),
    ])
    await Promise.all(
      communities.map((community, index) =>
        insertTestCommunityMember({
          communityId: community.id,
          userId: user.id,
          createdAt: new Date(Date.now() - (10 - index) * 10_000),
        }),
      ),
    )

    const rosterRequest = createRequest()
    await rosterRequest.authenticateAs(user)
    const rosterPage = await rosterRequest
      .get(`/api/v1/users/${user.id}/communities/member?limit=1`)
      .expect(200)

    const myRequest = createRequest()
    await myRequest.authenticateAs(user)
    await myRequest
      .get(
        `/api/v1/my/communities?limit=1&after=${encodeURIComponent(rosterPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })
})
