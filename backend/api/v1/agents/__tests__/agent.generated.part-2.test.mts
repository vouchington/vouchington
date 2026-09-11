import { describe, it, expect, beforeAll } from 'vitest'

import type { PrivateUser } from '@services/users/types'

import { createRequest } from '@voucha/api/test-helpers/server'
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

  describe('GET /api/v1/agents/:idOrSlug/conversations/:conversationId', () => {
    it('should return 404 for conversation that does not belong to agent (IDOR)', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const otherAgent = await createTestAgent({ agentType: 'moderator', activated: true })
      const user = await createTestUser()

      // Conversation only has a message from otherAgent, not agent
      const conv = await createTestConversation({
        createdById: user.id,
        title: 'Other agent conversation',
      })
      await createTestConversationMessage({
        conversationId: conv.id,
        createdById: otherAgent.system_user_id,
        content: { role: 'assistant', content: 'From other agent' },
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/agents/${agent.id}/conversations/${conv.id}`).expect(404)
    })
    it('should return conversation with messages', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const user = await createTestUser()

      const conversation = await createTestConversation({
        createdById: user.id,
        title: 'Detail test conversation',
      })
      await createTestConversationMessage({
        conversationId: conversation.id,
        createdById: user.id,
        content: { role: 'user', content: 'Test message' },
      })
      await createTestConversationMessage({
        conversationId: conversation.id,
        createdById: agent.system_user_id,
        content: { role: 'assistant', content: 'Test response' },
      })

      // Link conversation to a support thread (user consent required for admin access)
      const contact = await insertTestSupportContact({
        emailAddress: `tests+agent-conv-detail-${rand()}@voucha.ai`,
        userId: user.id,
      })
      await insertTestSupportThread({
        supportContactId: contact.id,
        conversationId: conversation.id,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/agents/${agent.id}/conversations/${conversation.id}`)
        .expect(200)

      expect(response.body).toHaveProperty('conversation')
      expect(response.body).toHaveProperty('results')
      expect(response.body.conversation.id).toBe(conversation.id)
      expect(response.body.results.length).toBe(2)
    })

    it('should return 404 for non-existent conversation', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .get(`/api/v1/agents/${agent.id}/conversations/00000000-0000-0000-0000-000000000000`)
        .expect(404)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof nonAdmin)
})
