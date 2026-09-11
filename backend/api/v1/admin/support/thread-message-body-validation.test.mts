import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportMessage,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('support message body validation', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
  ])('rejects %s when creating a message', async (_label, body) => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+message-root-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post(`/api/v1/support/threads/${thread.id}/messages`)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(400)

    expect(response.body.message).toBe('Request body must be an object')
  })

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
  ])('rejects %s when editing a draft message', async (_label, body) => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+draft-root-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const message = await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'outbound',
      draftedAt: new Date(),
    })
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .patch(`/api/v1/support/threads/${thread.id}/messages/${message.id}`)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(400)

    expect(response.body.message).toBe('Request body must be an object')
  })
})
