import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { encodeCursor } from '@modules/pagination'

describe('modmail API', () => {
  let owner: PrivateUser
  let mod: PrivateUser
  let member: PrivateUser
  let anon: PrivateUser
  let community: Community

  beforeAll(async () => {
    ;[owner, mod, member, anon] = await Promise.all([
      createTestUser(),
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

  describe('GET /api/v1/communities/:idOrSlug/modmail', () => {
    it('returns 401 for anonymous requests', async () => {
      const request = createRequest()
      await request.get(`/api/v1/communities/${community.slug}/modmail`).expect(401)
    })

    it('returns mod inbox for owner', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/modmail`)
        .expect(200)
      expect(response.body).toHaveProperty('results')
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('returns mod inbox for moderator', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/modmail`)
        .expect(200)
      expect(response.body).toHaveProperty('results')
    })

    it('returns member own threads for a regular member', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/modmail`)
        .expect(200)
      expect(response.body).toHaveProperty('results')
    })

    it('returns 403 for non-member', async () => {
      const request = createRequest()
      await request.authenticateAs(anon)
      await request.get(`/api/v1/communities/${community.slug}/modmail`).expect(403)
    })

    it('returns 400 for an invalid after cursor', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.get(`/api/v1/communities/${community.slug}/modmail?after=invalid`).expect(400)
    })

    it('accepts a valid after cursor and returns 200', async () => {
      const cursor = encodeCursor({
        timestamp: '2020-01-01T00:00:00.000000Z',
        id: '00000000-0000-7000-8000-000000000001',
      })
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/modmail?after=${encodeURIComponent(cursor)}`)
        .expect(200)
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('accepts a valid cursor for a member (own threads path)', async () => {
      const cursor = encodeCursor({
        timestamp: '2020-01-01T00:00:00.000000Z',
        id: '00000000-0000-7000-8000-000000000001',
      })
      const request = createRequest()
      await request.authenticateAs(member)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/modmail?after=${encodeURIComponent(cursor)}`)
        .expect(200)
      expect(Array.isArray(response.body.results)).toBe(true)
    })
  })

  describe('POST /api/v1/communities/:idOrSlug/modmail', () => {
    it('returns 401 for anonymous requests', async () => {
      const request = createRequest()
      await request.post(`/api/v1/communities/${community.slug}/modmail`).send({}).expect(401)
    })

    it('creates a modmail thread for a member', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/modmail`)
        .send({})
        .expect(201)
      expect(response.body.thread).toHaveProperty('id')
      expect(response.body.thread.channel_type).toBe('modmail')
    })

    it('creates a modmail thread for a mod (opens as subject for self)', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/modmail`)
        .send({})
        .expect(201)
      expect(response.body.thread).toHaveProperty('id')
      expect(response.body.thread.channel_type).toBe('modmail')
    })

    it('allows mod to open a thread on behalf of a subject user', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/modmail`)
        .send({ subject_user_id: member.id })
        .expect(201)
      expect(response.body.thread.subject_user_id).toBe(member.id)
    })

    it('returns 403 for non-member', async () => {
      const request = createRequest()
      await request.authenticateAs(anon)
      await request.post(`/api/v1/communities/${community.slug}/modmail`).send({}).expect(403)
    })
  })

  describe('GET /api/v1/communities/:idOrSlug/modmail/:conversationId', () => {
    let threadId: string

    beforeAll(async () => {
      const setupRequest = createRequest()
      await setupRequest.authenticateAs(member)
      const resp = await setupRequest
        .post(`/api/v1/communities/${community.slug}/modmail`)
        .send({})
        .expect(201)
      threadId = resp.body.thread.id as string
    })

    it('returns 401 for anonymous requests', async () => {
      const request = createRequest()
      await request.get(`/api/v1/communities/${community.slug}/modmail/${threadId}`).expect(401)
    })

    it('returns the thread for the subject user', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
        .expect(200)
      expect(response.body.thread).toHaveProperty('id', threadId)
    })

    it('returns the thread for a mod', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
        .expect(200)
      expect(response.body.thread.id).toBe(threadId)
    })

    it('returns 403 for a non-participant non-mod', async () => {
      const request = createRequest()
      await request.authenticateAs(anon)
      await request.get(`/api/v1/communities/${community.slug}/modmail/${threadId}`).expect(403)
    })

    it('returns 404 when thread is not in the community', async () => {
      const otherCommunity = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: otherCommunity.id,
        userId: owner.id,
        role: 'owner',
      })
      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .get(`/api/v1/communities/${otherCommunity.slug}/modmail/${threadId}`)
        .expect(404)
    })
  })
})
