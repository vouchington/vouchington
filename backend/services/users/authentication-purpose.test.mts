import { describe, expect, it } from 'vitest'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { v7 } from 'uuid'
import {
  createTestUser,
  createRandomEmailAddress,
} from '@voucha/test-helpers'
import {
  createEmailAddressLoginToken,
  verifyEmailAddressLoginToken,
} from './authentication.mts'

describe('email authentication code purposes', () => {
  it('accepts only the latest unused code of the requested purpose', async () => {
    const user = await createTestUser()
    const actor = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: {
        user_agent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
      },
    })
    const scope = {
      purpose: 're_auth' as const,
      currentUserId: user.id,
      session: { sid: actor.sessionToken.payload.sid, did: actor.deviceToken.payload.did },
    }
    const emailAddress = user.email_address!
    const oldLogin = await createEmailAddressLoginToken(emailAddress)
    const reAuth = await createEmailAddressLoginToken(emailAddress, scope)
    const login = await createEmailAddressLoginToken(emailAddress)

    expect((await verifyEmailAddressLoginToken(emailAddress, oldLogin.token)).success).toBe(false)
    expect((await verifyEmailAddressLoginToken(emailAddress, reAuth.token)).success).toBe(false)
    expect((await verifyEmailAddressLoginToken(emailAddress, login.token, scope)).success).toBe(
      false,
    )
    expect((await verifyEmailAddressLoginToken(emailAddress, login.token)).success).toBe(true)
    expect((await verifyEmailAddressLoginToken(emailAddress, reAuth.token, scope)).success).toBe(
      true,
    )
    expect((await verifyEmailAddressLoginToken(emailAddress, login.token)).success).toBe(false)
    expect((await verifyEmailAddressLoginToken(emailAddress, reAuth.token, scope)).success).toBe(
      false,
    )
  })

  it('serializes simultaneous issuance so exactly one new code remains usable', async () => {
    const emailAddress = createRandomEmailAddress()
    const issued = await Promise.all([
      createEmailAddressLoginToken(emailAddress),
      createEmailAddressLoginToken(emailAddress),
    ])
    const results = await Promise.all(
      issued.map(({ token }) => verifyEmailAddressLoginToken(emailAddress, token)),
    )
    expect(results.filter(result => result.success)).toHaveLength(1)
  })
})
