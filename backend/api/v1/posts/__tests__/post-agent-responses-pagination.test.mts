import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestAgent,
  insertTestPost,
  insertTestAgentPrompt,
  insertTestAgentModeration,
  createTestConversation,
  createTestConversationMessage,
} from '@voucha/test-helpers'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { createRandomString } from '../../../../test-helpers/data.mts'

describe('GET /api/v1/posts/:postId/agents/:agentId/responses pagination', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  async function setupModeratorPost() {
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const postId = await insertTestPost({
      title: `Test post ${createRandomString(8)}`,
      slug: `test-post-${createRandomString(8)}`,
      createdById: admin.id,
      markdown: 'Test content',
    })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    return { agent, postId, promptId }
  }

  describe('moderator branch', () => {
    it('returns real cursor page_info on the first page', async () => {
      const { agent, postId, promptId } = await setupModeratorPost()
      await insertTestAgentModeration({ postId, promptId, agentId: agent.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses`)
        .expect(200)

      expect(response.body.page_info.has_next_page).toBe(false)
      expect(typeof response.body.page_info.start_cursor).toBe('string')
      expect(response.body.page_info.end_cursor).toBeNull()
      expect(response.body.results[0]).not.toHaveProperty('cursor_timestamp')
    })

    it('returns a disjoint, complete second page via end_cursor', async () => {
      const { agent, postId, promptId } = await setupModeratorPost()
      const insertedIds = await Promise.all(
        Array.from({ length: 5 }, () =>
          insertTestAgentModeration({ postId, promptId, agentId: agent.id }),
        ),
      )

      const request = createRequest()
      await request.authenticateAs(admin)
      const firstPage = await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses?limit=3`)
        .expect(200)

      expect(firstPage.body.results).toHaveLength(3)
      expect(firstPage.body.page_info.has_next_page).toBe(true)
      expect(typeof firstPage.body.page_info.end_cursor).toBe('string')

      const secondPage = await request
        .get(
          `/api/v1/posts/${postId}/agents/${agent.id}/responses?limit=3&after=${encodeURIComponent(
            firstPage.body.page_info.end_cursor,
          )}`,
        )
        .expect(200)

      expect(secondPage.body.results).toHaveLength(2)
      expect(secondPage.body.page_info.has_next_page).toBe(false)
      expect(secondPage.body.page_info.end_cursor).toBeNull()

      const firstPageIds = firstPage.body.results.map((r: { id: string }) => r.id)
      const secondPageIds = secondPage.body.results.map((r: { id: string }) => r.id)
      expect(firstPageIds.filter((id: string) => secondPageIds.includes(id))).toHaveLength(0)
      expect(new Set([...firstPageIds, ...secondPageIds])).toEqual(new Set(insertedIds))
    })

    it('returns has_next_page=false and end_cursor=null when results exactly fill the limit', async () => {
      const { agent, postId, promptId } = await setupModeratorPost()
      const limit = 3
      const insertedIds = await Promise.all(
        Array.from({ length: limit }, () =>
          insertTestAgentModeration({ postId, promptId, agentId: agent.id }),
        ),
      )

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses?limit=${limit}`)
        .expect(200)

      expect(response.body.results).toHaveLength(limit)
      expect(new Set(response.body.results.map((r: { id: string }) => r.id))).toEqual(
        new Set(insertedIds),
      )
      expect(response.body.page_info.has_next_page).toBe(false)
      expect(response.body.page_info.end_cursor).toBeNull()
      expect(typeof response.body.page_info.start_cursor).toBe('string')
    })

    it('deterministically resolves a created_at tie via id DESC with no duplicate or gap across pages', async () => {
      const { agent, postId, promptId } = await setupModeratorPost()

      // `agent_moderations.created_at` is `GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL`,
      // and `agent_moderations.id` is immutable post-insert (moderation_transparency_agent_projection_guard
      // trigger). Force a deterministic tie by embedding the same millisecond timestamp into both ids at
      // insert time via `occurredAt`, varying only `occurredAtSequence` to keep the ids distinct.
      // Past-dated so these rows never outrank other tests' rows in a global agent_moderations query
      // under parallel, non-cleaned-up test runs — only the ordering of these two rows relative to
      // each other matters here.
      const tieAt = new Date(Date.now() - 120_000)
      const modA = await insertTestAgentModeration({
        postId,
        promptId,
        agentId: agent.id,
        occurredAt: tieAt,
        occurredAtSequence: 0,
      })
      const modB = await insertTestAgentModeration({
        postId,
        promptId,
        agentId: agent.id,
        occurredAt: tieAt,
        occurredAtSequence: 1,
      })

      const [higherId, lowerId] = [modA, modB].sort().reverse()

      const request = createRequest()
      await request.authenticateAs(admin)

      const firstPage = await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses?limit=1`)
        .expect(200)
      expect(firstPage.body.results).toHaveLength(1)
      expect(firstPage.body.results[0].id).toBe(higherId)
      expect(firstPage.body.page_info.has_next_page).toBe(true)

      const secondPage = await request
        .get(
          `/api/v1/posts/${postId}/agents/${agent.id}/responses?limit=1&after=${encodeURIComponent(
            firstPage.body.page_info.end_cursor,
          )}`,
        )
        .expect(200)
      expect(secondPage.body.results).toHaveLength(1)
      expect(secondPage.body.results[0].id).toBe(lowerId)
      expect(secondPage.body.page_info.has_next_page).toBe(false)
      expect(secondPage.body.page_info.end_cursor).toBeNull()
    })

    it('returns 400 for a malformed cursor', async () => {
      const { agent, postId } = await setupModeratorPost()

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses?after=not-a-valid-cursor`)
        .expect(400)
    })

    it('returns 400 when a cursor is replayed against a different post or agent scope', async () => {
      const { agent, postId, promptId } = await setupModeratorPost()
      await insertTestAgentModeration({ postId, promptId, agentId: agent.id })
      const { postId: otherPostId } = await setupModeratorPost()

      const request = createRequest()
      await request.authenticateAs(admin)

      const wrongPostScopeCursor = encodeScopedUuidCursor(
        crypto.randomUUID(),
        `post-agent-moderations:${otherPostId}:${agent.id}`,
      )
      await request
        .get(
          `/api/v1/posts/${postId}/agents/${agent.id}/responses?after=${encodeURIComponent(
            wrongPostScopeCursor,
          )}`,
        )
        .expect(400)

      const otherAgent = await createTestAgent({ agentType: 'moderator', activated: true })
      const wrongAgentScopeCursor = encodeScopedUuidCursor(
        crypto.randomUUID(),
        `post-agent-moderations:${postId}:${otherAgent.id}`,
      )
      await request
        .get(
          `/api/v1/posts/${postId}/agents/${agent.id}/responses?after=${encodeURIComponent(
            wrongAgentScopeCursor,
          )}`,
        )
        .expect(400)
    })

    it('returns 400 when an autotagger-branch cursor is replayed against the moderator branch', async () => {
      const { agent, postId, promptId } = await setupModeratorPost()
      await insertTestAgentModeration({ postId, promptId, agentId: agent.id })

      // Well-formed scoped-uuid cursor, but scoped to an unrelated cursor domain entirely
      // (not just a different post/agent within post-agent-moderations, per the test above).
      const autotaggerShapedCursor = Buffer.from(
        JSON.stringify({ id: crypto.randomUUID(), scope: 'some-autotagger-scope' }),
      ).toString('base64url')

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .get(
          `/api/v1/posts/${postId}/agents/${agent.id}/responses?after=${encodeURIComponent(
            autotaggerShapedCursor,
          )}`,
        )
        .expect(400)
    })
  })

  describe('autotagger branch', () => {
    it('forwards after/page_info unchanged across pages', async () => {
      const agent = await createTestAgent({ agentType: 'autotagger', activated: true })
      const postId = await insertTestPost({
        title: `Test post ${createRandomString(8)}`,
        slug: `test-post-${createRandomString(8)}`,
        createdById: admin.id,
        markdown: 'Test content',
      })
      const conversationIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const conversation = await createTestConversation({
          createdById: agent.system_user_id,
          postId,
          title: `Conversation ${i}`,
        })
        await createTestConversationMessage({
          conversationId: conversation.id,
          createdById: agent.system_user_id,
          content: { text: `message ${i}` },
        })
        conversationIds.push(conversation.id)
      }

      const request = createRequest()
      await request.authenticateAs(admin)
      const firstPage = await request
        .get(`/api/v1/posts/${postId}/agents/${agent.id}/responses?limit=2`)
        .expect(200)

      expect(firstPage.body.results).toHaveLength(2)
      expect(firstPage.body.page_info.has_next_page).toBe(true)
      expect(typeof firstPage.body.page_info.end_cursor).toBe('string')

      const secondPage = await request
        .get(
          `/api/v1/posts/${postId}/agents/${agent.id}/responses?limit=2&after=${encodeURIComponent(
            firstPage.body.page_info.end_cursor,
          )}`,
        )
        .expect(200)

      expect(secondPage.body.results).toHaveLength(1)
      expect(secondPage.body.page_info.has_next_page).toBe(false)
      expect(secondPage.body.page_info.end_cursor).toBeNull()

      const firstPageIds = firstPage.body.results.map((r: { id: string }) => r.id)
      const secondPageIds = secondPage.body.results.map((r: { id: string }) => r.id)
      expect(firstPageIds.filter((id: string) => secondPageIds.includes(id))).toHaveLength(0)
      expect(new Set([...firstPageIds, ...secondPageIds])).toEqual(new Set(conversationIds))
    })
  })
})
