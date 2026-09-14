import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestTopic,
  safeUsername,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { updateUserFields } from '@services/users/update-fields'

describe('GET /api/v1/users/:idOrSlug paginated public collections', () => {
  it('paginates followed topics with a stable timestamp cursor', async () => {
    const owner = await createTestUser({ username: safeUsername('topic-pages') })
    if (!owner) throw new Error('Failed to create owner')
    await updateUserFields(owner.id, { topic_follows_visibility: 'everyone' })

    const topicIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const suffix = safeUsername(`topic-page-${index}`)
      const topicId = await insertTestTopic({
        name: `Topic page ${suffix}`,
        slug: suffix,
        createdById: owner.id,
      })
      topicIds.push(topicId)
      await insertEntityRelation('relation__user__follow__topic', owner.id, topicId)
      await updateTestEntityRelationCreatedAt(
        'relation__user__follow__topic',
        owner.id,
        topicId,
        new Date(Date.now() - index * 10_000),
      )
    }

    const first = await createRequest()
      .get(`/api/v1/users/${owner.username}/topics/following?limit=2`)
      .expect(200)
    const second = await createRequest()
      .get(
        `/api/v1/users/${owner.username}/topics/following?limit=2&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(first.body.page_info.has_next_page).toBe(true)
    expect(second.body.page_info.has_next_page).toBe(false)
    const resultIds = [...first.body.results, ...second.body.results].map(
      (topic: { id: string }) => topic.id,
    )
    expect(resultIds).toEqual(topicIds)
    expect(new Set(resultIds).size).toBe(3)
  })

  it('rejects an invalid followed-topics cursor', async () => {
    const owner = await createTestUser({ username: safeUsername('topic-bad-cursor') })
    if (!owner) throw new Error('Failed to create owner')
    await createRequest()
      .get(`/api/v1/users/${owner.username}/topics/following?after=invalid`)
      .expect(400)
  })

  it('paginates visible community memberships without gaps from hidden rows', async () => {
    const owner = await createTestUser({ username: safeUsername('community-pages') })
    if (!owner) throw new Error('Failed to create owner')
    await updateUserFields(owner.id, { community_memberships_visibility: 'everyone' })

    const visibleIds: string[] = []
    for (let index = 0; index < 5; index++) {
      const visible = index % 2 === 0
      const community = await insertTestCommunity({
        createdById: owner.id,
        visibility: 'public',
        member_roster_visibility: visible ? 'public' : 'moderators',
      })
      if (visible) visibleIds.push(community.id)
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'member',
        createdAt: new Date(Date.now() - (10 - index) * 10_000),
      })
    }

    const first = await createRequest()
      .get(`/api/v1/users/${owner.username}/communities/member?limit=2`)
      .expect(200)
    const second = await createRequest()
      .get(
        `/api/v1/users/${owner.username}/communities/member?limit=2&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(first.body.results).toHaveLength(2)
    expect(first.body.page_info.has_next_page).toBe(true)
    expect(second.body.results).toHaveLength(1)
    expect(second.body.page_info.has_next_page).toBe(false)
    const resultIds = [...first.body.results, ...second.body.results].map(
      (community: { id: string }) => community.id,
    )
    expect(resultIds).toEqual(visibleIds)
  })

  it('rejects an invalid community-membership cursor', async () => {
    const owner = await createTestUser({ username: safeUsername('community-bad-cursor') })
    if (!owner) throw new Error('Failed to create owner')
    await createRequest()
      .get(`/api/v1/users/${owner.username}/communities/member?after=invalid`)
      .expect(400)
  })
})
