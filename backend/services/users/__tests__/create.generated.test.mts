import {
  createRandomEmailAddress,
  createRandomPhoneNumber,
  getLatestEmailAddressLoginTokenHash,
} from '@voucha/test-helpers'
import { it, expect, describe } from 'vitest'
import { createHash } from 'node:crypto'
import { upsertUser } from '../create.mts'
import { getPrivateUserByAny } from '../get.mts'
import { v7 } from 'uuid'
import {
  createEmailAddressLoginToken,
  createPhoneNumberLoginToken,
  verifyEmailAddressLoginToken,
  verifyPhoneNumberLoginToken,
} from '../authentication.mts'

describe('create.generated', () => {
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
