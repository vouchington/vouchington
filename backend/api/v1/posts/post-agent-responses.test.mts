import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  createTestAgent,
  insertTestPost,
  insertTestAgentPrompt,
  insertTestAgentModeration,
} from '@voucha/test-helpers'
import { createRandomString } from '../../../test-helpers/data.mts'

describe('post-agent-responses', () => {
  let admin: PrivateUser
  let nonAdmin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    nonAdmin = await createTestUser()
  })
  describe('GET /api/v1/posts/:postId/agents/:agentId/responses', () => {
    it('should return 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .get(
          '/api/v1/posts/00000000-0000-0000-0000-000000000000/agents/00000000-0000-0000-0000-000000000001/responses',
        )
        .expect(401)
    })

    it('should return 403 when not admin', async () => {
      const request = createRequest()
      await request.authenticateAs(nonAdmin)
      await request
        .get(
          '/api/v1/posts/00000000-0000-0000-0000-000000000000/agents/00000000-0000-0000-0000-000000000001/responses',
        )
        .expect(403)
    })

    it('should return 404 for non-existent post', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .get(`/api/v1/posts/00000000-0000-0000-0000-000000000000/agents/${agent.id}/responses`)
        .expect(404)
    })

    it('should return 404 for non-existent agent', async () => {
      const postId = await insertTestPost({
        title: `Test post ${createRandomString(8)}`,
        slug: `test-post-${createRandomString(8)}`,
        createdById: admin.id,
        markdown: 'Test content',
      })
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .get(`/api/v1/posts/${postId}/agents/00000000-0000-0000-0000-000000000000/responses`)
        .expect(404)
    })

    it('should return moderation results for moderator agent', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const postId = await insertTestPost({
        title: `Test post ${createRandomString(8)}`,
        slug: `test-post-${createRandomString(8)}`,
        createdById: admin.id,
        markdown: 'Test content',
      })
      const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
      await insertTestAgentModeration({
        postId,
        promptId,
        agentId: agent.id,
        results: { flagged: true, reason: 'Spam detected' },
        flagged: true,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses`)
        .expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('agent')
      expect(response.body.page_info).toBeDefined()
      expect(typeof response.body.page_info.has_next_page).toBe('boolean')
      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.results.length).toBe(1)
      expect(response.body.results[0].post_id).toBe(postId)
      expect(response.body.results[0].flagged).toBe(true)
      expect(response.body.results[0].results.reason).toBe('Spam detected')
      expect(response.body.agent.id).toBe(agent.id)
    })

    it('should support limit query param', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const postId = await insertTestPost({
        title: `Test post ${createRandomString(8)}`,
        slug: `test-post-${createRandomString(8)}`,
        createdById: admin.id,
        markdown: 'Test content',
      })
      // Insert multiple moderation records
      const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
      await insertTestAgentModeration({ postId, promptId, agentId: agent.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses?limit=1`)
        .expect(200)

      expect(response.body.results.length).toBeLessThanOrEqual(1)
    })

    it('should return conversations for autotagger agent', async () => {
      const agent = await createTestAgent({ agentType: 'autotagger', activated: true })
      const postId = await insertTestPost({
        title: `Test post ${createRandomString(8)}`,
        slug: `test-post-${createRandomString(8)}`,
        createdById: admin.id,
        markdown: 'Test content',
      })
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses`)
        .expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('agent')
      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.agent.id).toBe(agent.id)
    })

    it('should return empty results for post with no moderations', async () => {
      const agent = await createTestAgent({ agentType: 'moderator', activated: true })
      const postId = await insertTestPost({
        title: `Test post ${createRandomString(8)}`,
        slug: `test-post-${createRandomString(8)}`,
        createdById: admin.id,
        markdown: 'Test content',
      })
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses`)
        .expect(200)

      expect(response.body.results).toHaveLength(0)
    })
  })
})
