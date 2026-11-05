import { describe, expect, it } from 'vitest'
import { createUniqueTestEmail } from '../data.mts'
import { createLoginToken } from '../../services/users/login-token.mts'
import { insertEmailAddressLoginToken } from './email-addresses.mts'
import { getTestEmailLoginTokenState } from './login-tokens.mts'

describe('insertEmailAddressLoginToken', () => {
  it('replaces a pending login token so a retry can issue another code', async () => {
    const emailAddress = createUniqueTestEmail('pending-login')
    const first = createLoginToken()
    const second = createLoginToken()
    expect(first).not.toBe(second)

    await insertEmailAddressLoginToken(emailAddress, first)
    await insertEmailAddressLoginToken(emailAddress, second)

    await expect(getTestEmailLoginTokenState(emailAddress, first)).resolves.toEqual({
      invalidated: true,
      consumed: false,
    })
    await expect(getTestEmailLoginTokenState(emailAddress, second)).resolves.toEqual({
      invalidated: false,
      consumed: false,
    })
  })

  it('keeps a pending login token when recording a consumed token', async () => {
    const emailAddress = createUniqueTestEmail('consumed-login')
    const pending = createLoginToken()
    const consumed = createLoginToken()

    await insertEmailAddressLoginToken(emailAddress, pending)
    await insertEmailAddressLoginToken(emailAddress, consumed, true)

    await expect(getTestEmailLoginTokenState(emailAddress, pending)).resolves.toEqual({
      invalidated: false,
      consumed: false,
    })
    await expect(getTestEmailLoginTokenState(emailAddress, consumed)).resolves.toEqual({
      invalidated: false,
      consumed: true,
    })
  })
})
