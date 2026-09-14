import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestMembership,
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { decodeCursor, encodeCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'

describe('support thread service priority', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('orders unresolved Pro then Plus threads without exposing service levels', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const users = await Promise.all(Array.from({ length: 5 }, () => createTestUser()))
    const [, plusUser, pastDuePlusUser, proUser, pausedProUser] = users
    await Promise.all([
      createTestMembership({ user_id: plusUser!.id, plan: 'plus' }),
      createTestMembership({ user_id: pastDuePlusUser!.id, plan: 'plus', status: 'past_due' }),
      createTestMembership({ user_id: proUser!.id, plan: 'pro' }),
      createTestMembership({ user_id: pausedProUser!.id, plan: 'pro', status: 'paused' }),
    ])
    const contacts = await Promise.all(
      users.map(user =>
        insertTestSupportContact({ emailAddress: user.email_address!, userId: user.id }),
      ),
    )
    const threads = []
    for (const contact of contacts) {
      threads.push(
        await insertTestSupportThread({
          supportContactId: contact.id,
          subject: `support-priority-${suffix}`,
        }),
      )
    }
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/support/threads?q=support-priority-${suffix}&limit=10`)
      .expect(200)

    expect(response.body.results.map((thread: { id: string }) => thread.id)).toEqual([
      threads[3]!.id,
      threads[2]!.id,
      threads[1]!.id,
      threads[4]!.id,
      threads[0]!.id,
    ])
    expect(JSON.stringify(response.body.results)).not.toMatch(/service.?level|priority.?score/i)
  })

  it('paginates the staff inbox without duplicating or skipping same-level threads', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const [freeUser, firstPlusUser, secondPlusUser, proUser] = await Promise.all(
      Array.from({ length: 4 }, () => createTestUser()),
    )
    await Promise.all([
      createTestMembership({ user_id: firstPlusUser.id, plan: 'plus' }),
      createTestMembership({ user_id: secondPlusUser.id, plan: 'plus' }),
      createTestMembership({ user_id: proUser.id, plan: 'pro' }),
    ])
    const contacts = await Promise.all(
      [freeUser, firstPlusUser, secondPlusUser, proUser].map(user =>
        insertTestSupportContact({ emailAddress: user.email_address!, userId: user.id }),
      ),
    )
    const [freeThread, firstPlusThread, secondPlusThread, proThread] = await Promise.all(
      contacts.map(contact =>
        insertTestSupportThread({
          supportContactId: contact.id,
          subject: `support-priority-pagination-${suffix}`,
        }),
      ),
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    const firstPage = await request
      .get(`/api/v1/support/threads?q=support-priority-pagination-${suffix}&limit=2`)
      .expect(200)

    const firstPageIds = firstPage.body.results.map((thread: { id: string }) => thread.id)
    expect(firstPageIds[0]).toBe(proThread.id)
    expect(firstPageIds[1]).toBeOneOf([firstPlusThread.id, secondPlusThread.id])
    expect(firstPage.body.page_info.end_cursor).toEqual(expect.any(String))
    const cursor = decodeCursor(firstPage.body.page_info.end_cursor) as { scope?: string }
    expect(JSON.parse(cursor.scope!)).toEqual({
      resource: 'support-threads',
      version: 'v1',
      sort: 'unresolved-asc-service-level-desc-id-desc',
      status: null,
      q: `support-priority-pagination-${suffix}`,
    })

    const secondPage = await request
      .get(
        `/api/v1/support/threads?q=support-priority-pagination-${suffix}&limit=2&after=${encodeURIComponent(firstPage.body.page_info.end_cursor)}`,
      )
      .expect(200)

    const secondPageIds = secondPage.body.results.map((thread: { id: string }) => thread.id)
    const remainingPlusThreadId = [firstPlusThread.id, secondPlusThread.id].find(
      id => id !== firstPageIds[1],
    )
    expect(secondPageIds).toEqual([remainingPlusThreadId, freeThread.id])
    expect([...firstPageIds, ...secondPageIds]).toHaveLength(
      new Set([...firstPageIds, ...secondPageIds]).size,
    )
  })

  it('rejects malformed support-thread cursor shapes', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const malformedCursor = encodeCursor({
      id: admin.id,
      unresolved_sort: '0',
      service_level: 0,
      scope: 'support-threads',
    })

    await request
      .get(`/api/v1/support/threads?after=${encodeURIComponent(malformedCursor)}`)
      .expect(400)
  })

  it('rejects legacy ID-only support-thread cursors', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const legacyCursor = encodeCursor({ id: admin.id })

    await request
      .get(`/api/v1/support/threads?after=${encodeURIComponent(legacyCursor)}`)
      .expect(400)
  })

  it('rejects support-thread cursors replayed across search and status filters', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `support-priority-scope-${suffix}@voucha.ai`,
    })
    await Promise.all(
      Array.from({ length: 2 }, () =>
        insertTestSupportThread({
          supportContactId: contact.id,
          subject: `support-priority-scope-${suffix}`,
        }),
      ),
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    const firstPage = await request
      .get(`/api/v1/support/threads?q=support-priority-scope-${suffix}&limit=1`)
      .expect(200)
    const after = encodeURIComponent(firstPage.body.page_info.end_cursor)

    await request
      .get(`/api/v1/support/threads?q=other-support-priority-scope-${suffix}&after=${after}`)
      .expect(400)
    await request
      .get(`/api/v1/support/threads?q=support-priority-scope-${suffix}&status=open&after=${after}`)
      .expect(400)
  })

  it('keeps the captured cursor rank when its thread resolves between pages', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const [proUser, plusUser, freeUser] = await Promise.all(
      Array.from({ length: 3 }, () => createTestUser()),
    )
    await Promise.all([
      createTestMembership({ user_id: proUser.id, plan: 'pro' }),
      createTestMembership({ user_id: plusUser.id, plan: 'plus' }),
    ])
    const contacts = await Promise.all(
      [proUser, plusUser, freeUser].map(user =>
        insertTestSupportContact({ emailAddress: user.email_address!, userId: user.id }),
      ),
    )
    const threads = await Promise.all(
      contacts.map(contact =>
        insertTestSupportThread({
          supportContactId: contact.id,
          subject: `support-priority-resolve-${suffix}`,
        }),
      ),
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    const first = await request
      .get(`/api/v1/support/threads?q=support-priority-resolve-${suffix}&limit=1`)
      .expect(200)
    await request
      .patch(`/api/v1/support/threads/${threads[0]!.id}`)
      .send({ resolved: true })
      .expect(200)
    const second = await request
      .get(
        `/api/v1/support/threads?q=support-priority-resolve-${suffix}&limit=10&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(second.body.results.map((thread: { id: string }) => thread.id)).toEqual([
      threads[1]!.id,
      threads[2]!.id,
    ])
  })

  it('does not prioritize memberships expired by time and keeps their captured cursor rank', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const [proUser, plusUser, freeUser] = await Promise.all(
      Array.from({ length: 3 }, () => createTestUser()),
    )
    const [proMembership] = await Promise.all([
      createTestMembership({ user_id: proUser.id, plan: 'pro' }),
      createTestMembership({ user_id: plusUser.id, plan: 'plus' }),
    ])
    const contacts = await Promise.all(
      [proUser, plusUser, freeUser].map(user =>
        insertTestSupportContact({ emailAddress: user.email_address!, userId: user.id }),
      ),
    )
    const threads = await Promise.all(
      contacts.map(contact =>
        insertTestSupportThread({
          supportContactId: contact.id,
          subject: `support-priority-expiry-${suffix}`,
        }),
      ),
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    await updateTestMembershipExpiresAt(proMembership.id, new Date(Date.now() - 60_000))
    const ordered = await request
      .get(`/api/v1/support/threads?q=support-priority-expiry-${suffix}&limit=10`)
      .expect(200)
    const orderedIds = ordered.body.results.map((thread: { id: string }) => thread.id)
    expect(orderedIds[0]).toBe(threads[1]!.id)
    expect(orderedIds.slice(1)).toEqual(expect.arrayContaining([threads[0]!.id, threads[2]!.id]))
  })

  it('keeps the captured membership rank when it expires between pages', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const [proUser, plusUser, freeUser] = await Promise.all(
      Array.from({ length: 3 }, () => createTestUser()),
    )
    const [proMembership] = await Promise.all([
      createTestMembership({ user_id: proUser.id, plan: 'pro' }),
      createTestMembership({ user_id: plusUser.id, plan: 'plus' }),
    ])
    const contacts = await Promise.all(
      [proUser, plusUser, freeUser].map(user =>
        insertTestSupportContact({ emailAddress: user.email_address!, userId: user.id }),
      ),
    )
    const threads = await Promise.all(
      contacts.map(contact =>
        insertTestSupportThread({
          supportContactId: contact.id,
          subject: `support-priority-expiry-continuation-${suffix}`,
        }),
      ),
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    const first = await request
      .get(`/api/v1/support/threads?q=support-priority-expiry-continuation-${suffix}&limit=1`)
      .expect(200)
    await updateTestMembershipExpiresAt(proMembership.id, new Date(Date.now() - 60_000))
    const second = await request
      .get(
        `/api/v1/support/threads?q=support-priority-expiry-continuation-${suffix}&limit=10&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(second.body.results.map((thread: { id: string }) => thread.id)).toEqual([
      threads[1]!.id,
      threads[2]!.id,
    ])
  })
})
