import { describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { emails } from '@queues/emails/queues'
import { sentryCaptureExceptionMock } from '../../../../test-helpers/vitest.setup.sentry-mock.mts'
import { createEmailAddressLoginToken } from '@services/users/authentication'
import {
  assertEmailTokenRequestAllowed,
  assertEmailTokenVerificationAllowed,
  EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD,
} from '@services/users/email-auth-rate-limits'

const reAuthEmailTokens = '/api/v1/auth/mfa/re-auth/email/tokens'
const reAuthEmailVerification = '/api/v1/auth/mfa/re-auth/email/verification'
const reAuthTotpVerification = '/api/v1/auth/mfa/re-auth/totp/verification'

describe('re-authentication code boundaries', () => {
  it('keeps an issued re-authentication code usable when delivery admission fails', async () => {
    const user = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(user)
    const failure = new Error('Owned re-authentication email admission failure')
    const originalAdd = emails.add
    let issuedCode: string | undefined
    const spy = vi.spyOn(emails, 'add').mockImplementation((name, data, options) => {
      if (
        name === 'processSendReauthenticationToken' &&
        typeof data === 'object' &&
        data !== null &&
        'input' in data &&
        typeof data.input === 'object' &&
        data.input !== null &&
        'emailAddress' in data.input &&
        data.input.emailAddress === user.email_address &&
        'variables' in data &&
        typeof data.variables === 'object' &&
        data.variables !== null &&
        'token' in data.variables &&
        typeof data.variables.token === 'string'
      ) {
        issuedCode = data.variables.token
        return Promise.reject(failure)
      }
      return originalAdd.call(emails, name, data, options)
    })
    try {
      await req.post(reAuthEmailTokens).expect(200)
      expect(issuedCode).toBeTruthy()
      const verified = await req
        .post(reAuthEmailVerification)
        .send({ code: issuedCode })
        .expect(200)
      expect(verified.body.re_auth_token).toBeTruthy()
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure),
      ).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('accepts re-authentication email codes but rejects a login code without consuming it', async () => {
    const user = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(user)
    const emailAddress = user.email_address!
    const login = await createEmailAddressLoginToken(emailAddress)
    await req.post(reAuthEmailVerification).send({ code: login.token }).expect(401)
    const reAuth = await createEmailAddressLoginToken(emailAddress, {
      purpose: 're_auth',
      currentUserId: user.id,
      session: { sid: req.sid, did: req.did },
    })
    const result = await req.post(reAuthEmailVerification).send({ code: reAuth.token }).expect(200)
    expect(result.body.re_auth_token).toBeTruthy()
    await req.post(reAuthEmailVerification).send({ code: reAuth.token }).expect(401)
  })

  it('does not accept or consume another session’s email reauthentication code', async () => {
    const user = await createTestUser()
    const actor = createRequest()
    const other = createRequest()
    await actor.authenticateAs(user)
    await other.authenticateAs(user)
    const code = await createEmailAddressLoginToken(user.email_address!, {
      purpose: 're_auth',
      currentUserId: user.id,
      session: { sid: actor.sid, did: actor.did },
    })
    await other.post(reAuthEmailVerification).send({ code: code.token }).expect(401)
    await actor.post(reAuthEmailVerification).send({ code: code.token }).expect(200)
  })

  it('shares the email issuance and verification quotas with login', async () => {
    const user = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(user)
    const emailAddress = user.email_address!
    for (let index = 0; index < 4; index++) await assertEmailTokenRequestAllowed({ emailAddress })
    await req.post(reAuthEmailTokens).expect(429)
    for (let index = 0; index < EMAIL_LOGIN_VERIFY_RATE_LIMIT_THRESHOLD - 1; index++) {
      await assertEmailTokenVerificationAllowed({ emailAddress })
    }
    await req.post(reAuthEmailVerification).send({ code: 'ABCDEFG234' }).expect(429)
  })

  it('retains failed TOTP re-authentication limits across sessions for one user', async () => {
    const user = await createTestUser()
    const req = createRequest()
    await req.authenticateAs(user)
    for (let index = 0; index < 6; index++) {
      await req.post(reAuthTotpVerification).send({ code: '123456' }).expect(401)
    }
    await req.post(reAuthTotpVerification).send({ code: '123456' }).expect(429)
    const otherSession = createRequest()
    await otherSession.authenticateAs(user)
    await otherSession.post(reAuthTotpVerification).send({ code: '123456' }).expect(429)
  })
})
