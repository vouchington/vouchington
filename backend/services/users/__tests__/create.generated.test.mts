import {
  createRandomEmailAddress,
  createRandomPhoneNumber,
  getLatestEmailAddressLoginTokenHash,
  insertTestOAuthAccount,
} from '@voucha/test-helpers'
import { it, expect, describe } from 'vitest'
import { createHash } from 'node:crypto'
import { upsertUser } from '../create.mts'
import { getPrivateUserByAny } from '../get.mts'
import { v7 } from 'uuid'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { getOAuthAccountByProviderUserId } from '@services/oauth-accounts'
import {
  createEmailAddressLoginToken,
  createPhoneNumberLoginToken,
  verifyEmailAddressLoginToken,
  verifyPhoneNumberLoginToken,
} from '../authentication.mts'

describe('create.generated', () => {
  it('preserves an unlinked OAuth identity when connecting an existing user fails', async () => {
    const emailAddress = createRandomEmailAddress()
    const user = await upsertUser({ emailAddress, sessionId: v7(), deviceId: v7() })
    const providerUserId = `test-facebook-${v7()}`
    const account = await insertTestOAuthAccount('facebook', providerUserId, emailAddress)
    const options = {
      oauthAccount: { provider: 'facebook' as const, account },
      sessionId: v7(),
      deviceId: v7(),
    }
    let failure: unknown
    const { error } = await withPostgresQueryFailureForTest(
      '/* connectOAuthAccountToUser */',
      async () => {
        try {
          await upsertUser(options)
        } catch (err) {
          failure = err
        }
      },
    )
    expect(error).toMatchObject({ code: '25P02' })
    expect(failure).toBe(error)
    await expect(
      getOAuthAccountByProviderUserId('facebook', providerUserId),
    ).resolves.toMatchObject({ user_id: null })
    await expect(getPrivateUserByAny(user.id, { readOnly: false })).resolves.toMatchObject({
      facebook_account: null,
    })
    const retry = await upsertUser(options)
    expect(retry.id).toBe(user.id)
    await expect(
      getOAuthAccountByProviderUserId('facebook', providerUserId),
    ).resolves.toMatchObject({ user_id: user.id })
  })
  it('Sign up with Email Address', async () => {
    const email_address = createRandomEmailAddress()
    const { emailAddress, token } = await createEmailAddressLoginToken(email_address)
    expect(emailAddress).toEqual(email_address)

    const result = await verifyEmailAddressLoginToken(email_address, token)
    expect(result.success).toBe(true)
    expect(result.emailAddress).toEqual(email_address)

    const user = await upsertUser({
      emailAddress,
      sessionId: v7(),
      deviceId: v7(),
    })
    expect(user.email_address).toEqual(email_address)

    const user2 = await upsertUser({
      emailAddress,
      sessionId: v7(),
      deviceId: v7(),
    })
    expect(user2.email_address).toEqual(email_address)

    const user3 = await getPrivateUserByAny(email_address)
    expect(user3).not.toBeNull()
    expect(user3!.email_address).toEqual(email_address)
  })

  it('stores email login tokens as secret HMAC hashes', async () => {
    const email_address = createRandomEmailAddress()
    const { token } = await createEmailAddressLoginToken(email_address)
    const tokenHash = await getLatestEmailAddressLoginTokenHash(email_address)
    const bareSha256 = createHash('sha256').update(token).digest('hex').toUpperCase()

    expect(tokenHash).toMatch(/^[A-F0-9]{64}$/)
    expect(tokenHash).not.toBe(token)
    expect(tokenHash).not.toBe(bareSha256)
  })

  it('Sign up with Phone Number', async () => {
    const phone_number = createRandomPhoneNumber()
    const { phoneNumber, token } = await createPhoneNumberLoginToken(phone_number)
    // phoneNumber is normalized by verifyPhoneNumber, so it may differ from input
    expect(phoneNumber).toBeDefined()
    expect(typeof phoneNumber).toBe('string')

    const result = await verifyPhoneNumberLoginToken(phone_number, token)
    expect(result.success).toBe(true)
    expect(result.phoneNumber).toEqual(phoneNumber)

    const user = await upsertUser({
      phoneNumber,
      sessionId: v7(),
      deviceId: v7(),
    })
    expect(user.phone_number).toEqual(phoneNumber)

    const user2 = await upsertUser({
      phoneNumber,
      sessionId: v7(),
      deviceId: v7(),
    })
    expect(user2.phone_number).toEqual(phoneNumber)

    const user3 = await getPrivateUserByAny(phoneNumber)
    expect(user3).not.toBeNull()
    expect(user3!.phone_number).toEqual(phoneNumber)
  })
})
