import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  safeUsername,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { updateUserFields } from '@services/users/update-fields'

describe('GET /api/v1/users/:idOrSlug/communities/:listType pagination (non-member)', () => {
  it('returns an empty page when the user has no saved communities', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-save-page-empty') })
    if (!owner) throw new Error('Failed to create owner')

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request.get(`/api/v1/users/${owner.id}/communities/saved`).expect(200)
    expect(response.body).toMatchObject({
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
  })

  it('paginates saved communities at the exact limit across pages without duplicates', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-save-page-exact') })
    if (!owner) throw new Error('Failed to create owner')

    const communityIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
      communityIds.push(community.id)
      await insertEntityRelation('relation__user__save__community', owner.id, community.id)
      await updateTestEntityRelationCreatedAt(
        'relation__user__save__community',
        owner.id,
        community.id,
        new Date(Date.now() - index * 10_000),
      )
    }

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/communities/saved?limit=2`)
      .expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/communities/saved?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const resultIds = [...page1.body.results, ...page2.body.results].map(
      (community: { id: string }) => community.id,
    )
    expect(resultIds).toEqual(communityIds)
    expect(new Set(resultIds).size).toBe(3)
  })

  it('breaks ties deterministically when two saved communities share a created_at timestamp', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-save-page-tie') })
    if (!owner) throw new Error('Failed to create owner')

    const tieDate = new Date(Date.now() - 60_000)
    const communityA = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    const communityB = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertEntityRelation('relation__user__save__community', owner.id, communityA.id)
    await insertEntityRelation('relation__user__save__community', owner.id, communityB.id)
    await updateTestEntityRelationCreatedAt(
      'relation__user__save__community',
      owner.id,
      communityA.id,
      tieDate,
    )
    await updateTestEntityRelationCreatedAt(
      'relation__user__save__community',
      owner.id,
      communityB.id,
      tieDate,
    )
    const expectedOrder = [communityA.id, communityB.id].sort().reverse()

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request
      .get(`/api/v1/users/${owner.id}/communities/saved?limit=1`)
      .expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/communities/saved?limit=1&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect([page1.body.results[0].id, page2.body.results[0].id]).toEqual(expectedOrder)
  })

  it('rejects a malformed cursor', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-save-page-bad-cursor') })
    if (!owner) throw new Error('Failed to create owner')

    const request = createRequest()
    await request.authenticateAs(owner)
    await request.get(`/api/v1/users/${owner.id}/communities/saved?after=invalid`).expect(400)
  })

  it('rejects a cursor scoped to another user', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-save-page-scope-a') })
    const other = await createTestUser({ username: safeUsername('comm-save-page-scope-b') })
    if (!owner || !other) throw new Error('Failed to create users')

    for (let index = 0; index < 2; index++) {
      const community = await insertTestCommunity({ createdById: other.id, visibility: 'public' })
      await insertEntityRelation('relation__user__save__community', other.id, community.id)
    }

    const otherRequest = createRequest()
    await otherRequest.authenticateAs(other)
    const otherPage = await otherRequest
      .get(`/api/v1/users/${other.id}/communities/saved?limit=1`)
      .expect(200)
    expect(otherPage.body.page_info.end_cursor).not.toBeNull()

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await ownerRequest
      .get(
        `/api/v1/users/${owner.id}/communities/saved?limit=1&after=${encodeURIComponent(otherPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('rejects a cursor scoped to the proxy-following list type', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-save-page-scope-listtype') })
    if (!owner) throw new Error('Failed to create owner')

    for (let index = 0; index < 2; index++) {
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
      await insertEntityRelation('relation__user__save__community', owner.id, community.id)
    }

    const request = createRequest()
    await request.authenticateAs(owner)
    const savedPage = await request
      .get(`/api/v1/users/${owner.id}/communities/saved?limit=1`)
      .expect(200)
    expect(savedPage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/communities/proxy-following?limit=1&after=${encodeURIComponent(savedPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('rejects a saved-communities cursor replayed against the member roster endpoint', async () => {
    const owner = await createTestUser({ username: safeUsername('comm-save-page-scope-member') })
    if (!owner) throw new Error('Failed to create owner')
    await updateUserFields(owner.id, { community_memberships_visibility: 'everyone' })

    for (let index = 0; index < 2; index++) {
      const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
      await insertEntityRelation('relation__user__save__community', owner.id, community.id)
    }
    const memberCommunity = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'public',
    })
    await insertTestCommunityMember({
      communityId: memberCommunity.id,
      userId: owner.id,
      role: 'member',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const savedPage = await request
      .get(`/api/v1/users/${owner.id}/communities/saved?limit=1`)
      .expect(200)
    expect(savedPage.body.page_info.end_cursor).not.toBeNull()

    await request
      .get(
        `/api/v1/users/${owner.id}/communities/member?limit=1&after=${encodeURIComponent(savedPage.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })
})
