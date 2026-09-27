import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('modmail thread API', () => {
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

  describe('POST /api/v1/communities/:idOrSlug/modmail', () => {
    it('returns 422 when mod specifies a non-community-member as subject', async () => {
      const nonMember = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .post(`/api/v1/communities/${community.slug}/modmail`)
        .send({ subject_user_id: nonMember.id })
        .expect(422)
    })
  })

  describe('GET /api/v1/communities/:idOrSlug/modmail/:conversationId/messages', () => {
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
      await request
        .get(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .expect(401)
    })

    it('returns messages for the subject user', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .expect(200)
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('returns messages for a mod', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .expect(200)
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('returns 403 for a non-participant non-mod', async () => {
      const request = createRequest()
      await request.authenticateAs(anon)
      await request
        .get(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .expect(403)
    })

    it('returns 404 for a thread that belongs to a different community', async () => {
      const otherCommunity = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: otherCommunity.id,
        userId: owner.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .get(`/api/v1/communities/${otherCommunity.slug}/modmail/${threadId}/messages`)
        .expect(404)
    })
  })

  describe('POST /api/v1/communities/:idOrSlug/modmail/:conversationId/messages', () => {
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
      await request
        .post(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .send({ text: 'hi' })
        .expect(401)
    })

    it('allows the subject user to send a message', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .send({ text: 'Hello mod team' })
        .expect(201)
      expect(response.body.message).toHaveProperty('id')
      expect(response.body.message.body_text).toBe('Hello mod team')
    })

    it('allows a mod to send a message', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .send({ text: 'Hello from mod' })
        .expect(201)
      expect(response.body.message).toHaveProperty('id')
    })

    it('allows a site admin (non-community-mod) to send a message without prior openModmailThread', async () => {
      // Site admin authorizes via currentUserCanViewModmailThread but was never added
      // to conversation_participants via openModmailThread — the route must upsert them.
      const siteAdmin = await createTestUser({ administrator: true })
      const request = createRequest()
      await request.authenticateAs(siteAdmin)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .send({ text: 'Staff reply' })
        .expect(201)
      expect(response.body.message).toHaveProperty('id')
    })

    it('returns 400 when text is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .post(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .send({})
        .expect(400)
    })

    it('returns 422 when body is null JSON', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .post(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)
    })

    it('returns 403 for a non-participant non-mod', async () => {
      const request = createRequest()
      await request.authenticateAs(anon)
      await request
        .post(`/api/v1/communities/${community.slug}/modmail/${threadId}/messages`)
        .send({ text: 'spam' })
        .expect(403)
    })
  })

  describe('PATCH /api/v1/communities/:idOrSlug/modmail/:conversationId', () => {
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
      await request
        .patch(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
        .send({ resolved: true })
        .expect(401)
    })

    it('returns 403 for non-mod', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .patch(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
        .send({ resolved: true })
        .expect(403)
    })

    it('allows mod to assign the thread', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .patch(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
        .send({ assigned_mod_id: mod.id })
        .expect(200)
      expect(response.body.thread.assigned_mod_id).toBe(mod.id)
    })

    it('allows mod to resolve the thread', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      const response = await request
        .patch(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
        .send({ resolved: true })
        .expect(200)
      expect(response.body.thread.resolved_at).not.toBeNull()
    })

    it('allows mod to unresolve a resolved thread', async () => {
      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .patch(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
        .send({ resolved: true })
        .expect(200)
      const response = await request
        .patch(`/api/v1/communities/${community.slug}/modmail/${threadId}`)
        .send({ resolved: false })
        .expect(200)
      expect(response.body.thread.resolved_at).toBeNull()
    })

    it('returns 409 when unresolving a thread and another open thread exists for the subject', async () => {
      // Create and resolve thread A for a fresh subject so the unique index is clear.
      const freshMember = await createTestUser()
      await insertTestCommunityMember({
        communityId: community.id,
        userId: freshMember.id,
        role: 'member',
      })
      const createReq = createRequest()
      await createReq.authenticateAs(freshMember)
      const respA = await createReq
        .post(`/api/v1/communities/${community.slug}/modmail`)
        .send({})
        .expect(201)
      const threadAId = respA.body.thread.id as string

      // Resolve A — opens the slot for a new thread.
      const modReq = createRequest()
      await modReq.authenticateAs(mod)
      await modReq
        .patch(`/api/v1/communities/${community.slug}/modmail/${threadAId}`)
        .send({ resolved: true })
        .expect(200)

      // Create thread B (now the open one) for the same subject.
      await createReq.post(`/api/v1/communities/${community.slug}/modmail`).send({}).expect(201)

      // Trying to unresolve A should 409 because B is still open.
      await modReq
        .patch(`/api/v1/communities/${community.slug}/modmail/${threadAId}`)
        .send({ resolved: false })
        .expect(409)
    })
  })
})
