import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
  insertTestSupportMessage,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { linkSupportContactToUser, getSupportMessagesByThreadId } from '@services/customer-support'
import { createConversation } from '@services/conversations-messages'
import {
  getSupportAgentJobsFor,
  getSupportMessageEmbeddingJobsFor,
} from '@services/customer-support/queue-test-helpers'

describe('support-threads', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    ;[user, otherUser] = await Promise.all([createTestUser(), createTestUser()])
  })

  describe('POST /api/v1/my/support-threads', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.post('/api/v1/my/support-threads').send({ subject: 'Test issue' }).expect(401)
    })

    it('creates a support thread for authenticated user', async () => {
      const suffix = rand()

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post('/api/v1/my/support-threads')
        .send({ subject: `My issue ${suffix}` })
        .expect(201)

      expect(response.body.thread).toHaveProperty('subject', `My issue ${suffix}`)
      expect(response.body.thread).toHaveProperty('id')
      expect(response.body.thread).toHaveProperty('status', 'open')
    })

    it('creates a support thread with an initial inbound message', async () => {
      const suffix = rand()

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post('/api/v1/my/support-threads')
        .send({
          subject: `My issue ${suffix}`,
          message: `  Help me with this ${suffix}  `,
        })
        .expect(201)

      expect(response.body.thread).toHaveProperty('subject', `My issue ${suffix}`)
      expect(response.body.thread).toHaveProperty('status', 'open')
      expect(response.body.message).toHaveProperty('body_text', `Help me with this ${suffix}`)
      expect(response.body.message).toHaveProperty('direction', 'inbound')

      const { results: messages } = await getSupportMessagesByThreadId(response.body.thread.id)
      expect(messages).toHaveLength(1)
      expect(messages[0].body_text).toBe(`Help me with this ${suffix}`)

      await expect
        .poll(async () => (await getSupportAgentJobsFor(response.body.thread.id)).length)
        .toBe(1)

      await expect
        .poll(
          async () =>
            (
              await getSupportMessageEmbeddingJobsFor(
                response.body.thread.id,
                response.body.message.id,
              )
            ).length,
        )
        .toBe(1)
    })

    it('rejects non-string message values', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/my/support-threads')
        .send({ subject: 'Issue with invalid message', message: 123 })
        .expect(400)
    })

    it('returns a null message payload when message is blank', async () => {
      const suffix = rand()

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post('/api/v1/my/support-threads')
        .send({ subject: `Blank issue ${suffix}`, message: '   ' })
        .expect(201)

      expect(response.body).toHaveProperty('thread')
      expect(response.body).toHaveProperty('message', null)
    })

    it('returns 400 when subject is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/support-threads').send({}).expect(400)
    })

    it('returns 400 when subject is empty string', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/support-threads').send({ subject: '   ' }).expect(400)
    })

    it('accepts an owned optional conversation_id', async () => {
      const suffix = rand()
      const conversation = await createConversation(user.id, `Support context ${suffix}`)

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post('/api/v1/my/support-threads')
        .send({ subject: `Issue with context ${suffix}`, conversation_id: conversation.id })
        .expect(201)

      expect(response.body.thread).toHaveProperty('id')
      expect(response.body.thread).toHaveProperty('conversation_id', conversation.id)
    })

    it('returns 400 when conversation_id is malformed', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/my/support-threads')
        .send({ subject: 'Issue with bad context', conversation_id: 'not-a-uuid' })
        .expect(400)
    })

    it('returns 404 when conversation_id is not owned by the requester', async () => {
      const suffix = rand()
      const conversation = await createConversation(otherUser.id, `Other support context ${suffix}`)

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/my/support-threads')
        .send({ subject: `Issue with other context ${suffix}`, conversation_id: conversation.id })
        .expect(404)
    })

    it('returns 404 when conversation_id does not exist', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/my/support-threads')
        .send({
          subject: 'Issue with missing context',
          conversation_id: '00000000-0000-0000-0000-000000000007',
        })
        .expect(404)
    })
  })

  describe('GET /api/v1/my/support-threads', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/my/support-threads').expect(401)
    })

    it('returns empty list when user has no contact', async () => {
      // Create a user with no support contact/threads
      const freshUser = await createTestUser()

      const request = createRequest()
      await request.authenticateAs(freshUser)
      const response = await request.get('/api/v1/my/support-threads').expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body.results).toHaveLength(0)
      expect(response.body.page_info).toHaveProperty('has_next_page', false)
    })

    it('returns threads for user linked to a contact', async () => {
      const suffix = rand()
      const emailAddress = user.email_address ?? `tests+fallback-${suffix}@voucha.ai`

      const contact = await insertTestSupportContact({
        emailAddress,
        userId: user.id,
      })
      const thread = await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `My thread ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.get('/api/v1/my/support-threads').expect(200)

      expect(response.body).toHaveProperty('results')
      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(thread.id)
    })
  })

  describe('GET /api/v1/my/support-threads/:threadId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .get('/api/v1/my/support-threads/00000000-0000-0000-0000-000000000000')
        .expect(401)
    })

    it('returns thread with messages for owner', async () => {
      const suffix = rand()
      const emailAddress = user.email_address ?? `tests+fallback2-${suffix}@voucha.ai`

      const contact = await insertTestSupportContact({
        emailAddress,
        userId: user.id,
      })
      const thread = await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `Thread detail ${suffix}`,
      })
      await insertTestSupportMessage({
        supportThreadId: thread.id,
        bodyText: `Message in thread ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.get(`/api/v1/my/support-threads/${thread.id}`).expect(200)

      expect(response.body.thread).toHaveProperty('id', thread.id)
      expect(response.body).toHaveProperty('messages')
      expect(response.body).toHaveProperty('page_info')
      expect(Array.isArray(response.body.messages)).toBe(true)
    })

    it('returns 403 for thread owned by another user', async () => {
      const suffix = rand()
      const otherEmail = otherUser.email_address ?? `tests+other-${suffix}@voucha.ai`

      const otherContact = await insertTestSupportContact({
        emailAddress: otherEmail,
        userId: otherUser.id,
      })
      await linkSupportContactToUser(otherContact.id, otherUser.id)
      const otherThread = await insertTestSupportThread({
        supportContactId: otherContact.id,
        subject: `Other user thread ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(user)
      await request.get(`/api/v1/my/support-threads/${otherThread.id}`).expect(403)
    })

    it('returns 404 for non-existent thread', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .get('/api/v1/my/support-threads/00000000-0000-0000-0000-000000000007')
        .expect(404)
    })

    it('returns 400 for invalid thread ID', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get('/api/v1/my/support-threads/not-a-uuid').expect(400)
    })
  })
})
