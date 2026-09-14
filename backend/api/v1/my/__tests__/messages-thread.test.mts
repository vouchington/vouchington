import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, setTestUserDirectMessagesAudience } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { encodeCursor } from '@modules/pagination'

describe('messages thread API', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    ;[user, otherUser] = await Promise.all([createTestUser(), createTestUser()])
    await setTestUserDirectMessagesAudience(otherUser.id, 'everyone')
  })

  describe('GET /api/v1/my/messages/:conversationId/messages', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .get('/api/v1/my/messages/00000000-0000-7000-8000-000000000001/messages')
        .expect(401)
    })

    it('returns 403 when user is not a participant', async () => {
      const outsider = await createTestUser()

      const setupRequest = createRequest()
      await setupRequest.authenticateAs(user)
      const convResponse = await setupRequest
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      const conversationId = convResponse.body.conversation.id as string

      const request = createRequest()
      await request.authenticateAs(outsider)
      await request.get(`/api/v1/my/messages/${conversationId}/messages`).expect(403)
    })

    it('returns messages for a conversation participant', async () => {
      const setupRequest = createRequest()
      await setupRequest.authenticateAs(user)
      const convResponse = await setupRequest
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      const conversationId = convResponse.body.conversation.id as string

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .get(`/api/v1/my/messages/${conversationId}/messages`)
        .expect(200)
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('accepts a valid after cursor for message pagination', async () => {
      const setupRequest = createRequest()
      await setupRequest.authenticateAs(user)
      const convResponse = await setupRequest
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      const conversationId = convResponse.body.conversation.id as string

      const cursor = encodeCursor({ id: '00000000-0000-7000-8000-000000000001' })
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .get(`/api/v1/my/messages/${conversationId}/messages?after=${encodeURIComponent(cursor)}`)
        .expect(200)
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('paginates older messages chronologically without gaps or duplicates', async () => {
      const thirdUser = await createTestUser()
      await setTestUserDirectMessagesAudience(thirdUser.id, 'everyone')
      const request = createRequest()
      await request.authenticateAs(user)
      const conversation = await request
        .post('/api/v1/my/messages')
        .send({ user_ids: [otherUser.id, thirdUser.id] })
        .expect(201)
      const conversationId = conversation.body.conversation.id as string

      for (const text of ['oldest', 'middle', 'newest']) {
        await request
          .post(`/api/v1/my/messages/${conversationId}/messages`)
          .send({ text })
          .expect(201)
      }

      const firstPage = await request
        .get(`/api/v1/my/messages/${conversationId}/messages?limit=2`)
        .expect(200)
      expect(
        firstPage.body.results.map((message: { body_text: string }) => message.body_text),
      ).toEqual(['middle', 'newest'])
      expect(firstPage.body.page_info.has_next_page).toBe(true)
      expect(firstPage.body.page_info.start_cursor).toBeTruthy()
      expect(firstPage.body.page_info.end_cursor).toBeTruthy()

      const secondPage = await request
        .get(
          `/api/v1/my/messages/${conversationId}/messages?limit=2&after=${encodeURIComponent(firstPage.body.page_info.end_cursor)}`,
        )
        .expect(200)
      expect(
        secondPage.body.results.map((message: { body_text: string }) => message.body_text),
      ).toEqual(['oldest'])
      const ids = [...firstPage.body.results, ...secondPage.body.results].map(
        (message: { id: string }) => message.id,
      )
      expect(new Set(ids).size).toBe(3)
    })
  })

  describe('POST /api/v1/my/messages/:conversationId/messages', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/my/messages/nonexistent-id/messages')
        .send({ text: 'hello' })
        .expect(401)
    })

    it('sends a message in a conversation', async () => {
      const setupRequest = createRequest()
      await setupRequest.authenticateAs(user)
      const convResponse = await setupRequest
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      const conversationId = convResponse.body.conversation.id as string

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post(`/api/v1/my/messages/${conversationId}/messages`)
        .send({ text: 'Hello there' })
        .expect(201)
      expect(response.body.message).toHaveProperty('id')
      expect(response.body.message.body_text).toBe('Hello there')
    })

    it('returns 400 when text is missing', async () => {
      const setupRequest = createRequest()
      await setupRequest.authenticateAs(user)
      const convResponse = await setupRequest
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      const conversationId = convResponse.body.conversation.id as string

      const request = createRequest()
      await request.authenticateAs(user)
      await request.post(`/api/v1/my/messages/${conversationId}/messages`).send({}).expect(400)
    })

    it('returns 403 when user is not a participant', async () => {
      const outsider = await createTestUser()

      const setupRequest = createRequest()
      await setupRequest.authenticateAs(user)
      const convResponse = await setupRequest
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      const conversationId = convResponse.body.conversation.id as string

      const request = createRequest()
      await request.authenticateAs(outsider)
      await request
        .post(`/api/v1/my/messages/${conversationId}/messages`)
        .send({ text: 'Intruding' })
        .expect(403)
    })
  })

  describe('GET /api/v1/my/messages/:conversationId/participants', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .get('/api/v1/my/messages/00000000-0000-7000-8000-000000000001/participants')
        .expect(401)
    })

    it('returns participants for a conversation', async () => {
      const setupRequest = createRequest()
      await setupRequest.authenticateAs(user)
      const convResponse = await setupRequest
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      const conversationId = convResponse.body.conversation.id as string

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .get(`/api/v1/my/messages/${conversationId}/participants`)
        .expect(200)
      expect(Array.isArray(response.body.results)).toBe(true)
      const userIds = (response.body.results as Array<{ user_id: string }>).map(p => p.user_id)
      expect(userIds).toContain(user.id)
      expect(userIds).toContain(otherUser.id)
    })

    it('returns 403 when user is not a participant', async () => {
      const outsider = await createTestUser()

      const setupRequest = createRequest()
      await setupRequest.authenticateAs(user)
      const convResponse = await setupRequest
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      const conversationId = convResponse.body.conversation.id as string

      const request = createRequest()
      await request.authenticateAs(outsider)
      await request.get(`/api/v1/my/messages/${conversationId}/participants`).expect(403)
    })
  })
})
