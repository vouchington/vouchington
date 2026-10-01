import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  archiveTestCommunity,
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { getCommunity } from '@services/communities'

const path = (slug: string) => `/api/v1/communities/${slug}/automod-settings`

describe('PATCH /api/v1/communities/:idOrSlug/automod-settings', () => {
  it('returns 401 without auth', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })

    await createRequest()
      .patch(path(community.slug))
      .send({ automod_action: 'unpublish' })
      .expect(401)

    expect((await getCommunity(community.id))?.automod_action).toBe('record_only')
  })

  it('returns 403 for regular members and leaves the action unchanged', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })
    const request = createRequest()
    await request.authenticateAs(member)

    await request.patch(path(community.slug)).send({ automod_action: 'unpublish' }).expect(403)

    expect((await getCommunity(community.id))?.automod_action).toBe('record_only')
  })

  it('lets a moderator choose each action and returns the updated community', async () => {
    const [owner, moderator] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `automod-settings-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    for (const automod_action of ['review_queue', 'unpublish', 'record_only'] as const) {
      const response = await request
        .patch(path(community.slug))
        .send({ automod_action })
        .expect(200)
      expect(response.body.community).toMatchObject({ id: community.id, automod_action })
      expect(response.body.community).not.toHaveProperty('owner')
      expect((await getCommunity(community.id))?.automod_action).toBe(automod_action)
    }
  })

  it('lets the community owner change the action', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(owner)

    const response = await request
      .patch(path(community.slug))
      .send({ automod_action: 'review_queue' })
      .expect(200)

    expect(response.body.community.automod_action).toBe('review_queue')
  })

  it.each([
    ['an unknown action', { automod_action: 'delete' }],
    ['a non-string action', { automod_action: true }],
    ['a missing action', {}],
  ])('rejects %s with 422', async (_label, body) => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(owner)

    await request.patch(path(community.slug)).send(body).expect(422)

    expect((await getCommunity(community.id))?.automod_action).toBe('record_only')
  })

  it('returns 403 for archived communities', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await archiveTestCommunity({ communityId: community.id, archivedById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(owner)

    await request.patch(path(community.slug)).send({ automod_action: 'unpublish' }).expect(403)

    expect((await getCommunity(community.id))?.automod_action).toBe('record_only')
  })

  it('returns 404 for a community that does not exist', async () => {
    const owner = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(owner)

    await request
      .patch(path(`missing-${createRandomString(10)}`))
      .send({ automod_action: 'unpublish' })
      .expect(404)
  })
})
