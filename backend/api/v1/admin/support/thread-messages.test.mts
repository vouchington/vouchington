import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
  insertTestSupportMessage,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { ai_agents } from '@queues/ai-agents/queues'
import { SUPPORT_THREAD_INBOUND_MESSAGE_REQUIRED } from '@modules/on-error/error-codes'

describe('thread-messages', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('GET /api/v1/support/threads/:threadId/messages', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .get('/api/v1/support/threads/00000000-0000-0000-0000-000000000000/messages')
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+msg-list-403-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/support/threads/${thread.id}/messages`).expect(403)
    })

    it('returns messages for a thread', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+msg-list-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })
      const message = await insertTestSupportMessage({
        supportThreadId: thread.id,
        bodyText: `Test message ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/support/threads/${thread.id}/messages`)
        .expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')
      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(message.id)
    })

    it('returns 404 for non-existent thread', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .get('/api/v1/support/threads/00000000-0000-0000-0000-000000000003/messages')
        .expect(404)
    })
  })

  describe('POST /api/v1/support/threads/:threadId/messages', () => {
    it('rejects a reply for a resolved thread', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+resolved-reply-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ resolved: true })
        .expect(200)

      await request
        .post(`/api/v1/support/threads/${thread.id}/messages`)
        .send({ body_text: 'This reply must wait for reopen.' })
        .expect(409)
    })

    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/support/threads/00000000-0000-0000-0000-000000000000/messages')
        .send({ body_text: 'Hello' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+msg-create-403-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post(`/api/v1/support/threads/${thread.id}/messages`)
        .send({ body_text: 'Hello' })
        .expect(403)
    })

    it('admin can create an outbound message', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+msg-create-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .post(`/api/v1/support/threads/${thread.id}/messages`)
        .send({ body_text: `Admin reply ${suffix}` })
        .expect(201)

      expect(response.body.message).toHaveProperty('direction', 'outbound')
      expect(response.body.message).toHaveProperty('body_text', `Admin reply ${suffix}`)
      expect(response.body.message).toHaveProperty('created_by_id', admin.id)
    })

    it('returns 400 when body_text is missing', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+msg-create-nobody-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post(`/api/v1/support/threads/${thread.id}/messages`).send({}).expect(400)
    })
  })

  describe('POST /api/v1/support/threads/:threadId/drafts', () => {
    it('rejects draft generation without an inbound message', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+empty-draft-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })
      const request = createRequest()
      await request.authenticateAs(admin)

      const response = await request.post(`/api/v1/support/threads/${thread.id}/drafts`).expect(422)

      expect(response.body).toMatchObject({
        code: SUPPORT_THREAD_INBOUND_MESSAGE_REQUIRED,
        message: 'An inbound message is required before generating a draft',
      })
    })

    it('rejects draft generation for a resolved thread', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+resolved-draft-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ resolved: true })
        .expect(200)

      await request.post(`/api/v1/support/threads/${thread.id}/drafts`).expect(409)
    })

    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/support/threads/00000000-0000-0000-0000-000000000000/drafts')
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+draft-403-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.post(`/api/v1/support/threads/${thread.id}/drafts`).expect(403)
    })

    it('admin can trigger draft generation', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+draft-gen-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })
      await insertTestSupportMessage({
        supportThreadId: thread.id,
        direction: 'inbound',
        bodyText: `Draft context ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.post(`/api/v1/support/threads/${thread.id}/drafts`).expect(202)

      expect(response.body).toHaveProperty('queued', true)

      const supportJobs = await readAllQueueJobs(ai_agents)
      expect(
        supportJobs.some(job => (job.data as { threadId?: string }).threadId === thread.id),
      ).toBe(true)
    })

    it('returns 404 for non-existent thread', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/support/threads/00000000-0000-0000-0000-000000000004/drafts')
        .expect(404)
    })
  })

  describe('PATCH /api/v1/support/threads/:threadId/messages/:messageId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .patch(
          '/api/v1/support/threads/00000000-0000-0000-0000-000000000000/messages/00000000-0000-0000-0000-000000000000',
        )
        .send({ body_text: 'New text' })
        .expect(401)
    })

    it('admin can edit a draft message', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+msg-edit-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })
      const message = await insertTestSupportMessage({
        supportThreadId: thread.id,
        direction: 'outbound',
        bodyText: `Original text ${suffix}`,
        draftedAt: new Date(),
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/support/threads/${thread.id}/messages/${message.id}`)
        .send({ body_text: `Updated text ${suffix}` })
        .expect(200)

      expect(response.body.message).toHaveProperty('body_text', `Updated text ${suffix}`)
      expect(response.body.message).toHaveProperty('edited_by_id', admin.id)
    })

    it('returns 404 when message is not a draft or is already sent', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+msg-edit-sent-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })
      const message = await insertTestSupportMessage({
        supportThreadId: thread.id,
        direction: 'inbound',
        bodyText: `Inbound message ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      // Inbound messages have no drafted_at, so this should fail
      await request
        .patch(`/api/v1/support/threads/${thread.id}/messages/${message.id}`)
        .send({ body_text: 'Modified' })
        .expect(404)
    })
  })
})
