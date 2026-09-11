import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('saved-replies API', () => {
  let owner: PrivateUser
  let mod: PrivateUser
  let member: PrivateUser
  let community: Community

  beforeAll(async () => {
    ;[owner, mod, member] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: mod.id, role: 'moderator' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
    ])
  })

  describe('GET /api/v1/communities/:idOrSlug/saved-replies', () => {
    it('returns 401 for anonymous requests', async () => {
      const request = createRequest()
      await request.get(`/api/v1/communities/${community.slug}/saved-replies`).expect(401)
    })

    it('returns 403 for regular members', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      await request.get(`/api/v1/communities/${community.slug}/saved-replies`).expect(403)
    })

    it('returns saved replies for a moderator', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/saved-replies`)
        .expect(200)
      expect(response.body).toHaveProperty('results')
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('returns saved replies for the community owner', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/saved-replies`)
        .expect(200)
      expect(response.body).toHaveProperty('results')
    })
  })

  describe('POST /api/v1/communities/:idOrSlug/saved-replies', () => {
    it('returns 401 for anonymous requests', async () => {
      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/saved-replies`)
        .send({ body: 'Thank you for reaching out.' })
        .expect(401)
    })

    it('returns 403 for regular members', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .post(`/api/v1/communities/${community.slug}/saved-replies`)
        .send({ body: 'Thank you for reaching out.' })
        .expect(403)
    })

    it('creates a saved reply for a moderator', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/saved-replies`)
        .send({ title: 'Standard reply', body: 'Thank you for reaching out.' })
        .expect(201)
      expect(response.body.reply).toHaveProperty('id')
      expect(response.body.reply.title).toBe('Standard reply')
      expect(response.body.reply.body).toBe('Thank you for reaching out.')
    })

    it('returns 400 when body is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .post(`/api/v1/communities/${community.slug}/saved-replies`)
        .send({ title: 'No body' })
        .expect(400)
    })
  })

  describe('DELETE /api/v1/communities/:idOrSlug/saved-replies/:id', () => {
    let replyForMemberAttempt: string
    let replyForModDelete: string

    beforeAll(async () => {
      const { createSavedReply } = await import('@services/modmail/saved-replies')
      const r1 = await createSavedReply(mod.id, community.id, {
        body: 'To be deleted by member attempt',
        title: '',
      })
      const r2 = await createSavedReply(mod.id, community.id, {
        body: 'To be deleted by mod',
        title: '',
      })
      replyForMemberAttempt = r1.id
      replyForModDelete = r2.id
    })

    it('returns 401 for anonymous requests', async () => {
      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/saved-replies/some-id`)
        .expect(401)
    })

    it('returns 403 for regular members', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .delete(`/api/v1/communities/${community.slug}/saved-replies/${replyForMemberAttempt}`)
        .expect(403)
    })

    it('deletes a saved reply for a moderator', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .delete(`/api/v1/communities/${community.slug}/saved-replies/${replyForModDelete}`)
        .expect(204)

      // Verify it's gone from the list
      const listRequest = createRequest()
      await listRequest.authenticateAs(mod)
      const listResp = await listRequest
        .get(`/api/v1/communities/${community.slug}/saved-replies`)
        .expect(200)
      const ids = (listResp.body.results as Array<{ id: string }>).map(r => r.id)
      expect(ids).not.toContain(replyForModDelete)
    })
  })
})
