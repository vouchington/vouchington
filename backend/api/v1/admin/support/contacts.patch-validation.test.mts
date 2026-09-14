import { beforeAll, describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestSupportContact } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('support contact patch validation', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('rejects unknown properties even when a supported update is also supplied', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+contact-patch-shape-${suffix}@voucha.ai`,
    })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .patch(`/api/v1/support/contacts/${contact.id}`)
      .send({ name: 'Updated', unexpected: true })
      .expect(400)
  })

  it.each(['null', '[]', '"text"', '7'])('rejects non-object JSON roots: %s', async body => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+contact-patch-root-${suffix}@voucha.ai`,
    })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .patch(`/api/v1/support/contacts/${contact.id}`)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(400)
  })
})
