import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('support thread service priority cursor and status guards', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('rejects support-thread cursors that cannot be decoded', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .get('/api/v1/support/threads?after=not-a-decodable-cursor')
      .expect(400)

    expect(response.body.message).toBe('Invalid cursor format')
  })

  it('filters the staff inbox to assigned threads', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `support-priority-assigned-${suffix}@voucha.ai`,
    })
    const [assignedThread, openThread] = await Promise.all([
      insertTestSupportThread({
        supportContactId: contact.id,
        subject: `support-priority-assigned-${suffix}`,
      }),
      insertTestSupportThread({
        supportContactId: contact.id,
        subject: `support-priority-assigned-${suffix}`,
      }),
    ])
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .patch(`/api/v1/support/threads/${assignedThread.id}`)
      .send({ assigned_to_id: admin.id })
      .expect(200)

    const response = await request
      .get(`/api/v1/support/threads?q=support-priority-assigned-${suffix}&status=assigned`)
      .expect(200)

    expect(response.body.results.map((thread: { id: string }) => thread.id)).toEqual([
      assignedThread.id,
    ])
    expect(response.body.results.map((thread: { id: string }) => thread.id)).not.toContain(
      openThread.id,
    )
  })
})
