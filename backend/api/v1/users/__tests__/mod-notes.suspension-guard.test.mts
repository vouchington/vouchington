import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  safeUsername,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

describe('suspension guard on mod-note write routes', () => {
  it('suspended site admin gets 403 with ACCOUNT_SUSPENDED on POST /api/v1/users/:userId/mod-notes', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-susp-posttgt') })
    await suspendTestUser(admin.id)

    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Suspended admin note' })
      .set('Content-Type', 'application/json')
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    await unsuspendTestUser(admin.id)
  })

  it('suspended site admin gets 403 with ACCOUNT_SUSPENDED on DELETE /api/v1/users/:userId/mod-notes/:noteId', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-del-susp-tgt') })
    const request = createRequest()
    await request.authenticateAs(admin)

    const createResponse = await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Note before suspension' })
      .set('Content-Type', 'application/json')
      .expect(201)

    await suspendTestUser(admin.id)
    const response = await request
      .delete(`/api/v1/users/${target.id}/mod-notes/${createResponse.body.note.id}`)
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    await unsuspendTestUser(admin.id)
  })
})
