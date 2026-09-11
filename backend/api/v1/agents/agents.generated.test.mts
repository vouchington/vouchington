import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createTestAgent } from '@voucha/test-helpers'
import { decodeCursor, encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'

describe('agents.generated', () => {
  let admin: PrivateUser
  let nonAdmin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    nonAdmin = await createTestUser()
  })
  describe('GET /api/v1/agents', () => {
    it('should return 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/agents').expect(401)
    })

    it('should return 403 when authenticated but not admin', async () => {
      const request = createRequest()
      await request.authenticateAs(nonAdmin)
      await request.get('/api/v1/agents').expect(403)
    })

    it('should return agents list for admin', async () => {
      const agent = await createTestAgent({
        agentType: 'moderator',
        activated: true,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/agents').expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')
      expect(response.body).toHaveProperty('users')
      expect(Array.isArray(response.body.results)).toBe(true)

      // Verify our created agent appears
      const found = response.body.results.find((r: { id: string }) => r.id === agent.id)
      expect(found).toBeDefined()
      expect(found.agent_type).toBe('moderator')
    })

    it('should support pagination with limit', async () => {
      // Create multiple agents
      for (let i = 0; i < 3; i++) {
        await createTestAgent({ agentType: 'moderator' })
      }

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/agents?limit=2').expect(200)

      expect(response.body.results.length).toBeLessThanOrEqual(2)
      expect(response.body.page_info).toHaveProperty('has_next_page')
    })

    it('should support pagination with after cursor', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      const firstPage = await request.get('/api/v1/agents?limit=1').expect(200)
      expect(firstPage.body.results.length).toBeGreaterThan(0)

      expect(firstPage.body.page_info.has_next_page).toBe(true)
      expect(firstPage.body.page_info.end_cursor).toBeTruthy()
      const secondPage = await request
        .get(`/api/v1/agents?limit=1&after=${firstPage.body.page_info.end_cursor}`)
        .expect(200)

      expect(secondPage.body.results.length).toBeGreaterThan(0)
      expect(secondPage.body.results[0].id).not.toBe(firstPage.body.results[0].id)
    })

    it('rejects a cursor scoped to another agent resource', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .get('/api/v1/agents')
        .query({
          after: encodeScopedUuidCursor(
            crypto.randomUUID(),
            JSON.stringify({
              agentSystemUserId: crypto.randomUUID(),
              userId: null,
              postId: null,
              rssFeedItemId: null,
              onlyLinked: true,
              order: 'id-desc',
            }),
          ),
        })
        .expect(400)
    })

    it('rejects tampered and extra-key directory cursors', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const firstPage = await request.get('/api/v1/agents?limit=1').expect(200)
      const cursor = decodeCursor(firstPage.body.page_info.end_cursor) as {
        id: string
        scope: string
      }

      await request
        .get('/api/v1/agents')
        .query({ after: encodeCursor({ ...cursor, scope: `${cursor.scope}:tampered` }) })
        .expect(400)
      const withExtraKey = Buffer.from(JSON.stringify({ ...cursor, extra: true })).toString(
        'base64',
      )
      await request.get('/api/v1/agents').query({ after: withExtraKey }).expect(400)
    })
  })
})
