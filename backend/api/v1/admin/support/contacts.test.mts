import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('contacts', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('GET /api/v1/support/contacts', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/support/contacts').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/support/contacts').expect(403)
    })

    it('returns contacts for admin', async () => {
      const suffix = rand()
      await insertTestSupportContact({
        emailAddress: `tests+admin-contacts-list-${suffix}@voucha.ai`,
        name: `Contact ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/support/contacts').expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('supports search by email', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contacts-search-${suffix}@voucha.ai`,
        name: `Searchable Contact ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/support/contacts?q=admin-contacts-search-${suffix}`)
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(contact.id)
    })

    it('supports search by name', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contacts-byname-${suffix}@voucha.ai`,
        name: `UniqueNameSearch${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/support/contacts?q=UniqueNameSearch${suffix}`)
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(contact.id)
    })
  })

  describe('GET /api/v1/support/contacts/:contactId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/support/contacts/00000000-0000-0000-0000-000000000000').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contact-detail-403-${suffix}@voucha.ai`,
      })

      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/support/contacts/${contact.id}`).expect(403)
    })

    it('returns contact detail for admin', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contact-detail-${suffix}@voucha.ai`,
        name: `Detail Contact ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/support/contacts/${contact.id}`).expect(200)

      expect(response.body.contact).toHaveProperty('id', contact.id)
      expect(response.body.contact).toHaveProperty(
        'email_address',
        `tests+admin-contact-detail-${suffix}@voucha.ai`,
      )
    })

    it('returns support threads for the contact', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contact-detail-threads-${suffix}@voucha.ai`,
      })
      const thread = await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `Contact detail thread ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/support/contacts/${contact.id}`).expect(200)

      expect(response.body.threads).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: thread.id,
            subject: `Contact detail thread ${suffix}`,
          }),
        ]),
      )
      expect(response.body.thread_page_info).toHaveProperty('has_next_page', false)
    })

    it('supports cursor pagination for contact support threads', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contact-detail-thread-page-${suffix}@voucha.ai`,
      })
      await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `Older contact detail thread ${suffix}`,
      })
      const newerThread = await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `Newer contact detail thread ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const firstPage = await request
        .get(`/api/v1/support/contacts/${contact.id}?limit=1`)
        .expect(200)

      expect(firstPage.body.threads).toHaveLength(1)
      expect(firstPage.body.threads[0].id).toBe(newerThread.id)
      expect(firstPage.body.thread_page_info).toHaveProperty('has_next_page', true)
      expect(firstPage.body.thread_page_info.end_cursor).toEqual(expect.any(String))

      const secondPage = await request
        .get(
          `/api/v1/support/contacts/${contact.id}?limit=1&after=${encodeURIComponent(
            firstPage.body.thread_page_info.end_cursor,
          )}`,
        )
        .expect(200)

      expect(secondPage.body.threads).toHaveLength(1)
      expect(secondPage.body.threads[0].subject).toBe(`Older contact detail thread ${suffix}`)
      expect(secondPage.body.thread_page_info).toHaveProperty('has_next_page', false)
    })

    it('returns 404 for non-existent contact', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/support/contacts/00000000-0000-0000-0000-000000000005').expect(404)
    })

    it('returns 400 for invalid contact ID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/support/contacts/not-a-uuid').expect(400)
    })
  })

  describe('PATCH /api/v1/support/contacts/:contactId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .patch('/api/v1/support/contacts/00000000-0000-0000-0000-000000000000')
        .send({ name: 'New Name' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contact-patch-403-${suffix}@voucha.ai`,
      })

      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .patch(`/api/v1/support/contacts/${contact.id}`)
        .send({ name: 'New Name' })
        .expect(403)
    })

    it('admin can update contact name', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contact-update-${suffix}@voucha.ai`,
        name: `Old Name ${suffix}`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/support/contacts/${contact.id}`)
        .send({ name: `New Name ${suffix}` })
        .expect(200)

      expect(response.body.contact).toHaveProperty('name', `New Name ${suffix}`)
    })

    it('admin can update contact notes', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contact-notes-${suffix}@voucha.ai`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/support/contacts/${contact.id}`)
        .send({ notes: `Internal notes ${suffix}` })
        .expect(200)

      expect(response.body.contact).toHaveProperty('notes', `Internal notes ${suffix}`)
    })

    it('returns 400 when no valid fields provided', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contact-nofields-${suffix}@voucha.ai`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch(`/api/v1/support/contacts/${contact.id}`)
        .send({ unknown_field: 'value' })
        .expect(400)
    })

    it('returns 400 when a provided field has the wrong type', async () => {
      const suffix = rand()
      const contact = await insertTestSupportContact({
        emailAddress: `tests+admin-contact-invalid-field-${suffix}@voucha.ai`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request.patch(`/api/v1/support/contacts/${contact.id}`).send({ name: 42 }).expect(400)
    })

    it('returns 404 for non-existent contact', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch('/api/v1/support/contacts/00000000-0000-0000-0000-000000000006')
        .send({ name: 'Test' })
        .expect(404)
    })
  })
})
