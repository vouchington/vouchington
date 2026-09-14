import { beforeAll, describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('support thread patch validation', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it.each([
    ['empty body', {}],
    ['ambiguous body', { assigned_to_id: '00000000-0000-7000-8000-000000000001', resolved: true }],
    ['unknown property', { unexpected: true }],
    ['known and unknown properties', { resolved: true, unexpected: true }],
  ])('rejects %s instead of choosing a mutation', async (_label, body) => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+thread-patch-shape-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.patch(`/api/v1/support/threads/${thread.id}`).send(body).expect(400)
  })

  it.each(['null', '[]', '"text"', '7'])('rejects non-object JSON roots: %s', async body => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+thread-patch-root-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .patch(`/api/v1/support/threads/${thread.id}`)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(400)
  })
})
