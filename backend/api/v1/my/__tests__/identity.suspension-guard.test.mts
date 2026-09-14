import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  suspendTestUser,
  unsuspendTestUser,
  safeUsername,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('suspension guard on identity/email routes', () => {
  it('suspended user gets 403 on POST /api/v1/my/email-addresses', async () => {
    const user = await createTestUser({ username: safeUsername('susp-email-add') })
    await suspendTestUser(user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses')
      .send({ email_address: `tests+test-${randomSuffix()}@voucha.ai` })
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

    await unsuspendTestUser(user.id)
  })

  it('suspended user gets 403 on POST /api/v1/my/email-addresses/:email/verifications', async () => {
    const user = await createTestUser({ username: safeUsername('susp-email-verify') })
    await suspendTestUser(user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses/tests+test@voucha.ai/verifications')
      .send({ token: 'sometoken' })
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

    await unsuspendTestUser(user.id)
  })

  it('suspended user gets 403 on PATCH /api/v1/my/email-addresses/:email', async () => {
    const user = await createTestUser({ username: safeUsername('susp-email-primary') })
    await suspendTestUser(user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .patch('/api/v1/my/email-addresses/tests+test@voucha.ai')
      .send({ is_primary: true })
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

    await unsuspendTestUser(user.id)
  })

  it('suspended user gets 403 on DELETE /api/v1/my/email-addresses/:email', async () => {
    const user = await createTestUser({ username: safeUsername('susp-email-del') })
    await suspendTestUser(user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .delete('/api/v1/my/email-addresses/tests+test@voucha.ai')
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

    await unsuspendTestUser(user.id)
  })

  it('suspended user gets 403 on PATCH /api/v1/my/identity', async () => {
    const user = await createTestUser({ username: safeUsername('susp-identity') })
    await suspendTestUser(user.id)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .patch('/api/v1/my/identity')
      .send({ username: safeUsername('new-name') })
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

    await unsuspendTestUser(user.id)
  })
})
