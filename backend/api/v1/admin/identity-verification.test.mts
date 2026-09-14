import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect, setUserVerificationFields } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  attachCheckoutToIdentityVerificationAttempt,
  consumeIdentityVerificationAttempt,
  reserveIdentityVerificationAttempt,
} from '../../../services/identity-verification/attempts.mts'
import { beginIdentityVerificationProviderSession } from '../../../services/identity-verification/attempt-lifecycle.mts'
import { v7 } from 'uuid'

describe('POST /api/v1/admin/users/:userId/identity-verification-attempts', () => {
  let admin: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    admin = await createTestUserDirect({ administrator: true })
    member = await createTestUserDirect()
    const attempt = await reserveIdentityVerificationAttempt(member.id)
    const checkoutSessionId = `cs_${v7()}`
    await attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId)
    await beginIdentityVerificationProviderSession(checkoutSessionId)
    await consumeIdentityVerificationAttempt(checkoutSessionId, `vs_${v7()}`)
    await setUserVerificationFields(member.id, { verificationStatus: 'failed' })
  })

  it('rejects non-admin users', async () => {
    const request = createRequest()
    await request.authenticateAs(member)
    await request
      .post(`/api/v1/admin/users/${member.id}/identity-verification-attempts`)
      .send({ note: 'Provider terminal error verified by support.' })
      .expect(403)
  })

  it('requires an auditable support note', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post(`/api/v1/admin/users/${member.id}/identity-verification-attempts`)
      .send({ note: ' ' })
      .expect(422)
  })

  it('rejects a grant before a target completes a terminal Free attempt', async () => {
    const ineligibleMember = await createTestUserDirect()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post(`/api/v1/admin/users/${ineligibleMember.id}/identity-verification-attempts`)
      .send({ note: 'Provider terminal error verified by support.' })
      .expect(409)
  })

  it('rejects a grant for a nonexistent target', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post(
        '/api/v1/admin/users/00000000-0000-7000-8000-000000000999/identity-verification-attempts',
      )
      .send({ note: 'Provider terminal error verified by support.' })
      .expect(409)
  })

  it('creates an audited support grant', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post(`/api/v1/admin/users/${member.id}/identity-verification-attempts`)
      .send({ note: 'Provider terminal error verified by support.' })
      .expect(201)
    expect(response.body).toEqual({ granted: true })
  })
})
