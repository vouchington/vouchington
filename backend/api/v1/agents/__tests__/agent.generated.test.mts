import { describe, it, expect, beforeAll } from 'vitest'

import type { PrivateUser } from '@services/users/types'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestAgent,
  createTestConversation,
  createTestConversationMessage,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'

describe('agent.generated', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser

  let nonAdmin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    nonAdmin = await createTestUser()
  })

  describe('GET /api/v1/agents/:idOrSlug', () => {
    it('should return 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/agents/some-id').expect(401)
    })

    it('should return 403 when not admin', async () => {
      const request = createRequest()
      await request.authenticateAs(nonAdmin)
      await request.get('/api/v1/agents/some-id').expect(403)
    })

    it('should return 404 for non-existent agent', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/agents/00000000-0000-0000-0000-000000000000').expect(404)
    })

    it('should return agent by UUID', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/agents/${agent.id}`).expect(200)

      expect(response.body.agent.id).toBe(agent.id)
      expect(response.body.agent.system_user_id).toBe(agent.system_user_id)
      expect(response.body.agent.agent_type).toBe('moderator')
    })

    it('should return agent by moderator slug', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/agents/${agent.slug}`).expect(200)

      expect(response.body.agent.id).toBe(agent.id)
      expect(response.body.agent.slug).toBe(agent.slug)
    })

    it('should include user data in response', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/agents/${agent.id}`).expect(200)

      expect(response.body).toHaveProperty('user')
      expect(response.body.user).not.toBeNull()
      expect(response.body.user).toHaveProperty('id')
      expect(response.body.user.id).toBe(agent.system_user_id)
    })
  })

  describe('GET /api/v1/agents/:idOrSlug/conversations', () => {
    it('should return conversations where agent participated', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const user = await createTestUser()

      // Create a conversation and add a message from the agent
      const conversation = await createTestConversation({
        createdById: user.id,
        title: 'Test agent conversation',
      })
      await createTestConversationMessage({
        conversationId: conversation.id,
        createdById: user.id,
        content: { role: 'user', content: 'Hello agent' },
      })
      await createTestConversationMessage({
        conversationId: conversation.id,
        createdById: agent.system_user_id,
        content: { role: 'assistant', content: 'Hello user' },
      })

      // Link conversation to a support thread (user consent required for admin access)
      const contact = await insertTestSupportContact({
        emailAddress: `tests+agent-conv-test-${rand()}@voucha.ai`,
        userId: user.id,
      })
      await insertTestSupportThread({
        supportContactId: contact.id,
        conversationId: conversation.id,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/agents/${agent.id}/conversations`).expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')
      expect(response.body).toHaveProperty('users')

      const found = response.body.results.find((r: { id: string }) => r.id === conversation.id)
      expect(found).toBeDefined()
    })

    it('should filter conversations by user_id', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const userA = await createTestUser()
      const userB = await createTestUser()

      // Conversation by user A
      const convA = await createTestConversation({
        createdById: userA.id,
        title: 'Conversation A',
      })
      await createTestConversationMessage({
        conversationId: convA.id,
        createdById: agent.system_user_id,
        content: { role: 'assistant', content: 'Response A' },
      })

      // Conversation by user B
      const convB = await createTestConversation({
        createdById: userB.id,
        title: 'Conversation B',
      })
      await createTestConversationMessage({
        conversationId: convB.id,
        createdById: agent.system_user_id,
        content: { role: 'assistant', content: 'Response B' },
      })

      // Both conversations need support thread links for admin visibility
      const contactA = await insertTestSupportContact({
        emailAddress: `tests+agent-conv-userf-${rand()}@voucha.ai`,
        userId: userA.id,
      })
      await insertTestSupportThread({ supportContactId: contactA.id, conversationId: convA.id })
      const contactB = await insertTestSupportContact({
        emailAddress: `tests+agent-conv-userb-${rand()}@voucha.ai`,
        userId: userB.id,
      })
      await insertTestSupportThread({ supportContactId: contactB.id, conversationId: convB.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/agents/${agent.id}/conversations?user_id=${userA.id}`)
        .expect(200)

      // Should only contain conversation A
      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(convA.id)
      expect(ids).not.toContain(convB.id)
    })

    it('should filter conversations by rss_feed_item_id returning empty for unknown id', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const user = await createTestUser()

      const conv = await createTestConversation({
        createdById: user.id,
        title: 'RSS item id test conversation',
      })
      await createTestConversationMessage({
        conversationId: conv.id,
        createdById: agent.system_user_id,
        content: { role: 'assistant', content: 'Response' },
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      // Use a valid UUID that doesn't match any conversation
      const response = await request
        .get(
          `/api/v1/agents/${agent.id}/conversations?rss_feed_item_id=018f1234-5678-7abc-def0-123456789abc`,
        )
        .expect(200)

      // No conversation has this rss_feed_item_id, so no conversations match
      expect(response.body.results).toHaveLength(0)
    })

    it('should support pagination', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const user = await createTestUser()

      // Create multiple conversations
      for (let i = 0; i < 3; i++) {
        const conv = await createTestConversation({
          createdById: user.id,
          title: `Pagination conv ${i}`,
        })
        await createTestConversationMessage({
          conversationId: conv.id,
          createdById: agent.system_user_id,
          content: { role: 'assistant', content: `Response ${i}` },
        })
      }

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/agents/${agent.id}/conversations?limit=2`)
        .expect(200)

      expect(response.body.results.length).toBeLessThanOrEqual(2)
      expect(response.body.page_info).toHaveProperty('has_next_page')
    })
  })
})
