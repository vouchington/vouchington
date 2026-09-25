import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createConversation } from '@services/conversations-messages/create'
import { suspendUser } from '@services/users'
import * as safetyModule from '../../check-api-message-safety.mts'
import type { PrivateUser } from '@services/users/types'
import '../index.mts'

// Covers the post-auth runtime request-contract validation added for issue #320: structural
// path/body checks must run after identity, suspension, and ownership authorization, and before
// any semantic (route-local) check or service call. See backend/services/runtime-request-validation.
describe('index.generated - post-auth request contract validation', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })

  describe('POST /api/v1/conversations', () => {
    it('should return 422 for a non-object JSON body', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/conversations')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)
    })

    it('should require authentication before validating a malformed body', async () => {
      const request = createRequest()
      const response = await request
        .post('/api/v1/conversations')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(401)
      expect(response.text).not.toMatch(/invalid/i)
    })

    it('should reject a malformed body from a suspended user with 403, not 422', async () => {
      const suspendedUser = await createTestUser()
      await suspendUser(admin, suspendedUser.id)
      const request = createRequest()
      await request.authenticateAs(suspendedUser)
      await request
        .post('/api/v1/conversations')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(403)
    })
  })

  describe('POST /api/v1/conversations/:conversationId/chat', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('should require authentication before validating a malformed conversationId', async () => {
      const request = createRequest()
      const response = await request
        .post('/api/v1/conversations/test-id/chat')
        .send({ message: 'Hello' })
        .expect(401)
      expect(response.text).not.toMatch(/invalid/i)
    })

    it('should return 422 (not 500) for a malformed conversationId', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/conversations/not-a-uuid/chat')
        .send({ message: 'Hello' })
        .expect(422)
    })

    it('should reject a suspended user with 403 before validating a malformed conversationId', async () => {
      const suspendedUser = await createTestUser()
      await suspendUser(admin, suspendedUser.id)
      const request = createRequest()
      await request.authenticateAs(suspendedUser)
      await request
        .post('/api/v1/conversations/not-a-uuid/chat')
        .send({ message: 'Hello' })
        .expect(403)
    })

    it('should reject a malformed body for a conversation owned by another user with 403, not 422', async () => {
      const otherUser = await createTestUser()
      const conversation = await createConversation(otherUser.id, 'Other user chat')
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/conversations/${conversation.id}/chat`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(403)
    })

    it('should return 422 for a non-object JSON body without calling the safety check', async () => {
      const safetySpy = vi.spyOn(safetyModule, 'checkApiMessageSafety')
      const conversation = await createConversation(user.id, 'Test')
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/conversations/${conversation.id}/chat`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)
      expect(safetySpy).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/v1/conversations/:conversationId/client-generated-chat', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('should require authentication before validating a malformed conversationId', async () => {
      const request = createRequest()
      const response = await request
        .post('/api/v1/conversations/test-id/client-generated-chat')
        .send({ message: 'Hello', assistant_content: 'Hi', model_provider: 'apple_foundation' })
        .expect(401)
      expect(response.text).not.toMatch(/invalid/i)
    })

    it('should return 422 (not 500) for a malformed conversationId', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/conversations/not-a-uuid/client-generated-chat')
        .send({ message: 'Hello', assistant_content: 'Hi', model_provider: 'apple_foundation' })
        .expect(422)
    })

    it('should reject a suspended user with 403 before validating a malformed conversationId', async () => {
      const suspendedUser = await createTestUser()
      await suspendUser(admin, suspendedUser.id)
      const request = createRequest()
      await request.authenticateAs(suspendedUser)
      await request
        .post('/api/v1/conversations/not-a-uuid/client-generated-chat')
        .send({ message: 'Hello', assistant_content: 'Hi', model_provider: 'apple_foundation' })
        .expect(403)
    })

    it('should reject a malformed body for a conversation owned by another user with 403, not 422', async () => {
      const otherUser = await createTestUser()
      const conversation = await createConversation(otherUser.id, 'Other local model')
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/conversations/${conversation.id}/client-generated-chat`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(403)
    })

    it('should return 422 for a non-object JSON body without calling the safety check', async () => {
      const safetySpy = vi.spyOn(safetyModule, 'checkApiMessageSafety')
      const conversation = await createConversation(user.id, 'Local model')
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/conversations/${conversation.id}/client-generated-chat`)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(422)
      expect(safetySpy).not.toHaveBeenCalled()
    })
  })
})
