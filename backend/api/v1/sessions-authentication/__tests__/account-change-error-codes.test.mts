import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTotpAuthenticator } from '@voucha/test-helpers'
import { createTestAccountChangeProof } from '@voucha/test-helpers/account-change'

describe('stable codes for rejected account-setting changes', () => {
  it('codes the refusal to remove the last sign-in method', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const proof = await createTestAccountChangeProof(user.id, request)

    const response = await request
      .delete(`/api/v1/my/email-addresses/${encodeURIComponent(user.email_address ?? '')}`)
      .send({ re_auth_token: proof })
      .expect(400)

    expect(response.body.code).toBe('LAST_SIGN_IN_METHOD_REMOVAL_FORBIDDEN')
  })

  it('codes the refusal to remove an administrator final MFA factor', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin)
    const listed = await request.get('/api/v1/auth/totp').expect(200)
    const factors = listed.body.results as { id: string }[]
    for (const factor of factors.slice(1)) {
      const spare = await createTestAccountChangeProof(admin.id, request)
      await request
        .delete(`/api/v1/auth/totp/${factor.id}`)
        .send({ re_auth_token: spare })
        .expect(204)
    }
    const proof = await createTestAccountChangeProof(admin.id, request)
    const only = factors[0]

    const response = await request
      .delete(`/api/v1/auth/totp/${only.id}`)
      .send({ re_auth_token: proof })
      .expect(403)

    expect(response.body.code).toBe('ADMINISTRATOR_MFA_REQUIRED')
  })

  it('codes a replayed confirmation proof as MFA_REAUTH_REQUIRED', async () => {
    const user = await createTestUser()
    await insertTestTotpAuthenticator(user.id, 'replay-keep')
    const first = await insertTestTotpAuthenticator(user.id, 'replay-first')
    const second = await insertTestTotpAuthenticator(user.id, 'replay-second')
    const request = createRequest()
    await request.authenticateAs(user)
    const proof = await createTestAccountChangeProof(user.id, request)

    await request.delete(`/api/v1/auth/totp/${first.id}`).send({ re_auth_token: proof }).expect(204)
    const replay = await request
      .delete(`/api/v1/auth/totp/${second.id}`)
      .send({ re_auth_token: proof })
      .expect(403)

    expect(replay.body.code).toBe('MFA_REAUTH_REQUIRED')
  })
})
