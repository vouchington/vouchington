import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser } from '@voucha/test-helpers'
import { createTestGroupConversation } from '@voucha/test-helpers/entities/conversations'
import { setTestUserDirectMessagesAudience } from '@voucha/test-helpers/entities/users-dm-audience'
import type { PrivateUser } from '@services/users/types'

describe('messages participants API', () => {
  let owner: PrivateUser
  let member: PrivateUser
  let outsider: PrivateUser
  let conversationId: string

  beforeAll(async () => {
    ;[owner, member, outsider] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const conv = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [member.id],
    })
    conversationId = conv.id
  })

  describe('GET /api/v1/my/messages/:conversationId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get(`/api/v1/my/messages/${conversationId}`).expect(401)
    })

    it('returns conversation with participant_add_policy for participant', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request.get(`/api/v1/my/messages/${conversationId}`).expect(200)
      expect(response.body.conversation).toHaveProperty('id', conversationId)
      expect(response.body.conversation).toHaveProperty('participant_add_policy', 'owner_only')
      expect(response.body.conversation).toHaveProperty('created_by_id', owner.id)
    })

    it('returns 403 for non-participant', async () => {
      const request = createRequest()
      await request.authenticateAs(outsider)
      await request.get(`/api/v1/my/messages/${conversationId}`).expect(403)
    })

    it('returns 422 for invalid conversation ID', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.get('/api/v1/my/messages/not-a-uuid').expect(422)
    })
  })

  describe('POST /api/v1/my/messages/:conversationId/participants', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post(`/api/v1/my/messages/${conversationId}/participants`)
        .set('Content-Type', 'application/json')
        .send({ user_id: outsider.id })
        .expect(401)
    })

    it('returns 415 for wrong content-type', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .post(`/api/v1/my/messages/${conversationId}/participants`)
        .set('Content-Type', 'text/plain')
        .send(outsider.id)
        .expect(415)
    })

    it('owner can add a new participant', async () => {
      const newUser = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .post(`/api/v1/my/messages/${conversationId}/participants`)
        .send({ user_id: newUser.id })
        .expect(201)
      expect(response.body.participant).toHaveProperty('user_id', newUser.id)
      expect(response.body.participant).toHaveProperty('role', 'member')
    })

    it('returns 403 for non-owner under owner_only policy', async () => {
      const newUser = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .post(`/api/v1/my/messages/${conversationId}/participants`)
        .send({ user_id: newUser.id })
        .expect(403)
    })

    it('returns 422 for invalid user_id', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .post(`/api/v1/my/messages/${conversationId}/participants`)
        .send({ user_id: 'not-a-uuid' })
        .expect(422)
    })

    it('returns 400 when trying to add yourself', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .post(`/api/v1/my/messages/${conversationId}/participants`)
        .send({ user_id: owner.id })
        .expect(400)
    })

    it('returns 409 when user is already a participant', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .post(`/api/v1/my/messages/${conversationId}/participants`)
        .send({ user_id: member.id })
        .expect(409)
    })
  })

  describe('DELETE /api/v1/my/messages/:conversationId/participants/:userId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .delete(`/api/v1/my/messages/${conversationId}/participants/${member.id}`)
        .expect(401)
    })

    it('owner can remove another participant', async () => {
      const targetUser = await createTestUser()
      const localConv = await createTestGroupConversation({
        createdById: owner.id,
        memberUserIds: [targetUser.id],
      })
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .delete(`/api/v1/my/messages/${localConv.id}/participants/${targetUser.id}`)
        .expect(204)
    })

    it('member can remove themselves (leave)', async () => {
      const leavingUser = await createTestUser()
      const localConv = await createTestGroupConversation({
        createdById: owner.id,
        memberUserIds: [leavingUser.id],
      })
      const request = createRequest()
      await request.authenticateAs(leavingUser)
      await request
        .delete(`/api/v1/my/messages/${localConv.id}/participants/${leavingUser.id}`)
        .expect(204)
    })

    it('returns 403 when non-owner tries to remove another participant', async () => {
      const victim = await createTestUser()
      const localConv = await createTestGroupConversation({
        createdById: owner.id,
        memberUserIds: [member.id, victim.id],
      })
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .delete(`/api/v1/my/messages/${localConv.id}/participants/${victim.id}`)
        .expect(403)
    })

    it('returns 422 for invalid participant user ID', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .delete(`/api/v1/my/messages/${conversationId}/participants/not-a-uuid`)
        .expect(422)
    })

    it('returns 403 for non-participant trying to remove', async () => {
      const victim = await createTestUser()
      const localConv = await createTestGroupConversation({
        createdById: owner.id,
        memberUserIds: [victim.id],
      })
      const request = createRequest()
      await request.authenticateAs(outsider)
      await request
        .delete(`/api/v1/my/messages/${localConv.id}/participants/${victim.id}`)
        .expect(403)
    })
  })

  describe('PATCH /api/v1/my/messages/:conversationId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .patch(`/api/v1/my/messages/${conversationId}`)
        .set('Content-Type', 'application/json')
        .send({ participant_add_policy: 'all_members' })
        .expect(401)
    })

    it('owner can change participant_add_policy', async () => {
      const localConv = await createTestGroupConversation({
        createdById: owner.id,
        memberUserIds: [],
      })
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .patch(`/api/v1/my/messages/${localConv.id}`)
        .send({ participant_add_policy: 'all_members' })
        .expect(200)
      expect(response.body).toHaveProperty('participant_add_policy', 'all_members')
    })

    it('returns 403 for non-owner', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .patch(`/api/v1/my/messages/${conversationId}`)
        .send({ participant_add_policy: 'all_members' })
        .expect(403)
    })

    it('returns 422 for invalid policy value', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .patch(`/api/v1/my/messages/${conversationId}`)
        .send({ participant_add_policy: 'invalid_value' })
        .expect(422)
    })

    it('returns 415 for wrong content-type', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .patch(`/api/v1/my/messages/${conversationId}`)
        .set('Content-Type', 'text/plain')
        .send('owner_only')
        .expect(415)
    })

    it('returns 422 for invalid conversation ID', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .patch('/api/v1/my/messages/not-a-uuid')
        .send({ participant_add_policy: 'owner_only' })
        .expect(422)
    })

    it('returns 403 for suspended owner', async () => {
      const suspendedOwner = await createTestUser()
      const localConv = await createTestGroupConversation({
        createdById: suspendedOwner.id,
        memberUserIds: [],
      })
      await suspendTestUser(suspendedOwner.id)
      const request = createRequest()
      await request.authenticateAs(suspendedOwner)
      await request
        .patch(`/api/v1/my/messages/${localConv.id}`)
        .send({ participant_add_policy: 'all_members' })
        .expect(403)
    })
  })

  describe('POST /api/v1/my/messages/:conversationId/participants (validation)', () => {
    it('returns 404 when adding a non-existent user', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const fakeId = '00000000-0000-0000-0000-000000000099'
      await request
        .post(`/api/v1/my/messages/${conversationId}/participants`)
        .send({ user_id: fakeId })
        .expect(404)
    })

    it('returns 403 when target user has nobody audience', async () => {
      const restrictedUser = await createTestUser()
      await setTestUserDirectMessagesAudience(restrictedUser.id, 'nobody')
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .post(`/api/v1/my/messages/${conversationId}/participants`)
        .send({ user_id: restrictedUser.id })
        .expect(403)
    })
  })
})
