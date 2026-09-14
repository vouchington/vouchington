import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestAgent,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import type { PrivateUser } from '@services/users/types'
import { decodeCursor, encodeCursor } from '@modules/pagination'

describe('agent-conversations', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let agentSlug: string
  let agentSystemUserId: string

  let unlinkedConvId: string
  let linkedConvId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser()

    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    agentSlug = agent.slug!
    agentSystemUserId = agent.system_user_id

    const suffix = crypto.randomUUID().slice(0, 8)

    const unlinked = await createConversation(regularUser.id, `Unlinked agent conv ${suffix}`)
    unlinkedConvId = unlinked.id
    await createConversationMessage(unlinked.id, agentSystemUserId, {
      role: 'assistant',
      content: `Agent reply in unlinked conv ${suffix}`,
    })

    const linked = await createConversation(regularUser.id, `Linked agent conv ${suffix}`)
    linkedConvId = linked.id
    await createConversationMessage(linked.id, agentSystemUserId, {
      role: 'assistant',
      content: `Agent reply in linked conv ${suffix}`,
    })
    const contact = await insertTestSupportContact({
      emailAddress: `tests+agent-conv-test-${suffix}@voucha.ai`,
      userId: regularUser.id,
    })
    await insertTestSupportThread({ supportContactId: contact.id, conversationId: linked.id })

    const otherUser = await createTestUser()
    const otherLinked = await createConversation(otherUser.id, `Other linked agent conv ${suffix}`)
    await createConversationMessage(otherLinked.id, agentSystemUserId, {
      role: 'assistant',
      content: `Agent reply in other linked conv ${suffix}`,
    })
    const otherContact = await insertTestSupportContact({
      emailAddress: `tests+other-agent-conv-test-${suffix}@voucha.ai`,
      userId: otherUser.id,
    })
    await insertTestSupportThread({
      supportContactId: otherContact.id,
      conversationId: otherLinked.id,
    })
  })

  describe('GET /api/v1/agents/:idOrSlug/conversations', () => {
    it('returns 401 for unauthenticated request', async () => {
      const request = createRequest()
      await request.get(`/api/v1/agents/${agentSlug}/conversations`).expect(401)
    })

    it('returns 403 for non-admin user', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/agents/${agentSlug}/conversations`).expect(403)
    })

    it('excludes conversations not linked to a support thread', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/agents/${agentSlug}/conversations`).expect(200)
      const ids = response.body.results.map((c: { id: string }) => c.id)
      expect(ids).not.toContain(unlinkedConvId)
    })

    it('includes conversations linked to a support thread', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/agents/${agentSlug}/conversations`).expect(200)
      const ids = response.body.results.map((c: { id: string }) => c.id)
      expect(ids).toContain(linkedConvId)
    })
  })

  describe('GET /api/v1/agents/:idOrSlug/conversations/:conversationId', () => {
    it('returns 401 for unauthenticated request', async () => {
      const request = createRequest()
      await request.get(`/api/v1/agents/${agentSlug}/conversations/${linkedConvId}`).expect(401)
    })

    it('returns 403 for non-admin user', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/agents/${agentSlug}/conversations/${linkedConvId}`).expect(403)
    })

    it('returns 404 for admin accessing unlinked conversation', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/agents/${agentSlug}/conversations/${unlinkedConvId}`).expect(404)
    })

    it('returns 200 with conversation and messages for admin accessing linked conversation', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/agents/${agentSlug}/conversations/${linkedConvId}`)
        .expect(200)

      expect(response.body.conversation).toBeDefined()
      expect(response.body.conversation.id).toBe(linkedConvId)
      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body).not.toHaveProperty('messages')
    })

    it.each([
      ['raw UUID', crypto.randomUUID()],
      ['malformed opaque value', 'not-an-opaque-cursor'],
    ])('rejects a %s message cursor', async (_label, after) => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .get(`/api/v1/agents/${agentSlug}/conversations/${linkedConvId}`)
        .query({ after })
        .expect(400)
    })

    it('marks an exact-limit message page terminal', async () => {
      const conv = await createConversation(
        regularUser.id,
        `Exact agent page ${crypto.randomUUID()}`,
      )
      await Promise.all(
        ['first', 'second'].map(content =>
          createConversationMessage(conv.id, agentSystemUserId, { role: 'assistant', content }),
        ),
      )
      const contact = await insertTestSupportContact({
        emailAddress: `tests+agent-exact-${crypto.randomUUID()}@voucha.ai`,
        userId: regularUser.id,
      })
      await insertTestSupportThread({ supportContactId: contact.id, conversationId: conv.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/agents/${agentSlug}/conversations/${conv.id}`)
        .query({ limit: '2' })
        .expect(200)

      expect(response.body.results).toHaveLength(2)
      expect(response.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    })

    it('paginates three messages chronologically without gaps or duplicates', async () => {
      const conv = await createConversation(
        regularUser.id,
        `Paged agent messages ${crypto.randomUUID()}`,
      )
      const created = []
      for (const content of ['oldest', 'middle', 'newest']) {
        created.push(
          await createConversationMessage(conv.id, agentSystemUserId, {
            role: 'assistant',
            content,
          }),
        )
      }
      const contact = await insertTestSupportContact({
        emailAddress: `tests+agent-page-${crypto.randomUUID()}@voucha.ai`,
        userId: regularUser.id,
      })
      await insertTestSupportThread({ supportContactId: contact.id, conversationId: conv.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      const first = await request
        .get(`/api/v1/agents/${agentSlug}/conversations/${conv.id}`)
        .query({ limit: '2' })
        .expect(200)
      const second = await request
        .get(`/api/v1/agents/${agentSlug}/conversations/${conv.id}`)
        .query({ limit: '2', after: first.body.page_info.end_cursor })
        .expect(200)

      expect(first.body.results.map((message: { id: string }) => message.id)).toEqual([
        created[1]!.id,
        created[2]!.id,
      ])
      expect(first.body.page_info.has_next_page).toBe(true)
      expect(second.body.results.map((message: { id: string }) => message.id)).toEqual([
        created[0]!.id,
      ])
      expect(second.body.page_info.has_next_page).toBe(false)
      expect(
        new Set(
          [...first.body.results, ...second.body.results].map(
            (message: { id: string }) => message.id,
          ),
        ).size,
      ).toBe(3)
    })

    it('rejects message cursors replayed for another conversation or with tampered keys', async () => {
      const firstConversation = await createConversation(
        regularUser.id,
        `Scoped messages A ${crypto.randomUUID()}`,
      )
      const secondConversation = await createConversation(
        regularUser.id,
        `Scoped messages B ${crypto.randomUUID()}`,
      )
      await Promise.all(
        [firstConversation, secondConversation].map(async conversation => {
          await Promise.all(
            ['first', 'second'].map(content =>
              createConversationMessage(conversation.id, agentSystemUserId, {
                role: 'assistant',
                content,
              }),
            ),
          )
          const contact = await insertTestSupportContact({
            emailAddress: `tests+agent-message-scope-${crypto.randomUUID()}@voucha.ai`,
            userId: regularUser.id,
          })
          await insertTestSupportThread({
            supportContactId: contact.id,
            conversationId: conversation.id,
          })
        }),
      )

      const request = createRequest()
      await request.authenticateAs(admin)
      const firstPage = await request
        .get(`/api/v1/agents/${agentSlug}/conversations/${firstConversation.id}`)
        .query({ limit: 1 })
        .expect(200)
      const after = firstPage.body.page_info.end_cursor as string

      await request
        .get(`/api/v1/agents/${agentSlug}/conversations/${secondConversation.id}`)
        .query({ after, limit: 1 })
        .expect(400)

      const cursor = decodeCursor(after) as { id: string; scope: string }
      await request
        .get(`/api/v1/agents/${agentSlug}/conversations/${firstConversation.id}`)
        .query({ after: encodeCursor({ ...cursor, scope: `${cursor.scope}:tampered` }), limit: 1 })
        .expect(400)
      const withExtraKey = Buffer.from(JSON.stringify({ ...cursor, extra: true })).toString(
        'base64',
      )
      await request
        .get(`/api/v1/agents/${agentSlug}/conversations/${firstConversation.id}`)
        .query({ after: withExtraKey, limit: 1 })
        .expect(400)
    })
  })
})
