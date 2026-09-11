import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  createRandomString,
} from '@voucha/test-helpers'

describe('Community Ban Routes', () => {
  describe('POST /api/v1/communities/:slug/bans', () => {
    it('returns 401 without auth', async () => {
      const owner = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `ban-post-401-${random}`,
      })

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/bans`)
        .send({ user_id: owner.id })
        .expect(401)
    })

    it('returns 403 for regular member', async () => {
      const [owner, member, target] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-post-403-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: member!.id }),
        insertTestCommunityMember({ communityId: community.id, userId: target!.id }),
      ])

      const request = createRequest()
      await request.authenticateAs(member!)
      await request
        .post(`/api/v1/communities/${community.slug}/bans`)
        .send({ user_id: target!.id })
        .expect(403)
    })

    it('owner bans a member and returns 201', async () => {
      const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-post-ok-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: target!.id }),
      ])

      const request = createRequest()
      await request.authenticateAs(owner!)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/bans`)
        .send({ user_id: target!.id, reason: 'Spamming' })
        .expect(201)

      expect(response.body.community_ban).toMatchObject({
        community_id: community.id,
        user_id: target!.id,
        reason: 'Spamming',
      })
    })

    it('moderator bans a regular member and returns 201', async () => {
      const [owner, mod, target] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-post-mod-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: mod!.id,
          role: 'moderator',
        }),
        insertTestCommunityMember({ communityId: community.id, userId: target!.id }),
      ])

      const request = createRequest()
      await request.authenticateAs(mod!)
      await request
        .post(`/api/v1/communities/${community.slug}/bans`)
        .send({ user_id: target!.id })
        .expect(201)
    })

    it('returns 422 for missing user_id', async () => {
      const owner = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `ban-post-422-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(owner)
      await request.post(`/api/v1/communities/${community.slug}/bans`).send({}).expect(422)
    })

    it('returns 422 for a non-object JSON body (array)', async () => {
      const owner = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `ban-post-arr-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(owner)
      await request.post(`/api/v1/communities/${community.slug}/bans`).send([]).expect(422)
    })

    it('returns 422 for invalid expires_at', async () => {
      const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-post-exp-422-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: target!.id }),
      ])

      const request = createRequest()
      await request.authenticateAs(owner!)
      await request
        .post(`/api/v1/communities/${community.slug}/bans`)
        .send({ user_id: target!.id, expires_at: new Date(Date.now() - 1000).toISOString() })
        .expect(422)
    })
  })
})
