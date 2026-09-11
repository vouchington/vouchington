import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('threads', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('GET /api/v1/support/threads', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/support/threads').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/support/threads').expect(403)
    })

    it('returns threads for admin', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-list-${suffix}@voucha.ai`,
        name: `Test User ${suffix}`,
      })
      await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `Admin thread list test ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/support/threads').expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('filters by status=open', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-status-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `Open thread ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/support/threads?status=open').expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(thread.id)
    })

    it('supports search by subject', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-search-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `unique-subject-${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/support/threads?q=unique-subject-${suffix}`)
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(thread.id)
    })

    it('returns 400 for an unsupported status filter', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/support/threads?status=pending').expect(400)
    })
  })

  describe('GET /api/v1/support/threads/:threadId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/support/threads/00000000-0000-0000-0000-000000000000').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-detail-403-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/support/threads/${thread.id}`).expect(403)
    })

    it('returns thread detail for admin', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-detail-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `Thread detail test ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/support/threads/${thread.id}`).expect(200)

      expect(response.body.thread).toHaveProperty('id', thread.id)
      expect(response.body.thread).toHaveProperty('subject', `Thread detail test ${suffix}`)
      expect(response.body.thread).toHaveProperty('status')
    })

    it('returns 404 for non-existent thread', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/support/threads/00000000-0000-0000-0000-000000000001').expect(404)
    })

    it('returns 400 for invalid thread ID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/support/threads/not-a-uuid').expect(400)
    })
  })

  describe('PATCH /api/v1/support/threads/:threadId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .patch('/api/v1/support/threads/00000000-0000-0000-0000-000000000000')
        .send({ resolved: true })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-patch-403-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ resolved: true })
        .expect(403)
    })

    it('admin can assign a thread', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-assign-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ assigned_to_id: admin.id })
        .expect(200)

      expect(response.body.thread).toHaveProperty('id', thread.id)
      expect(response.body.thread).toHaveProperty('assigned_to_id', admin.id)
      expect(response.body.thread).toHaveProperty('status', 'assigned')
    })

    it('admin can resolve a thread', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-resolve-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ resolved: true })
        .expect(200)

      expect(response.body.thread).toHaveProperty('id', thread.id)
      expect(response.body.thread).toHaveProperty('status', 'resolved')
    })

    it('admin can reopen a resolved thread', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-reopen-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(admin)

      // First resolve
      await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ resolved: true })
        .expect(200)

      // Then reopen
      const response = await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ resolved: false })
        .expect(200)

      expect(response.body.thread).toHaveProperty('id', thread.id)
      expect(response.body.thread).toHaveProperty('status', 'open')
    })

    it('returns 400 for no valid update fields', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-nofields-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ unknown_field: 'value' })
        .expect(400)
    })

    it('returns 400 for invalid assigned_to_id', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-baduuid-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ assigned_to_id: 'not-a-uuid' })
        .expect(400)
    })

    it('returns 400 for the assign-to-self alias', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-thread-alias-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({ supportContactId: contact.id })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ assigned_to_id: 'me' })
        .expect(400)
    })

    it('returns 404 for non-existent thread', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch('/api/v1/support/threads/00000000-0000-0000-0000-000000000002')
        .send({ resolved: true })
        .expect(404)
    })
  })
})
