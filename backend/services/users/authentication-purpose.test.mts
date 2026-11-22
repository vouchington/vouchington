import { describe, expect, it } from 'vitest'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { v7 } from 'uuid'
import { createTestUser, createRandomEmailAddress } from '@voucha/test-helpers'
import { withRepeatableReadPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'
import { createEmailAddressLoginToken, verifyEmailAddressLoginToken } from './authentication.mts'

describe('email authentication code purposes', () => {
  installEmailDomainDnsMock()

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

  it('rejects a competing login code and keeps the winning code usable once', async () => {
    const emailAddress = createRandomEmailAddress()
    const scope = { purpose: 'login' } as const
    const winner = await withRepeatableReadPostgresTransactionForTest(async query => {
      // Establish the competing transaction's snapshot before either caller can see a pending code.
      const beforeIssuance = await verifyEmailAddressLoginToken(emailAddress, 'AAAAAAAA', scope, {
        query,
      })
      expect(beforeIssuance.success).toBe(false)

      const issued = await createEmailAddressLoginToken(emailAddress)
      await expect(
        createEmailAddressLoginToken(emailAddress, scope, { query }),
      ).rejects.toMatchObject({ status: 409 })
      return issued
    })

    const verified = await verifyEmailAddressLoginToken(emailAddress, winner.token)
    expect(verified.success).toBe(true)
    const replayed = await verifyEmailAddressLoginToken(emailAddress, winner.token)
    expect(replayed.success).toBe(false)
  })
})
