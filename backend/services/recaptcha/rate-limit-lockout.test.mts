import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rateLimiterValkeyClient } from '@data-stores/valkey/clients'
import { pollUntilNotNull } from '@voucha/test-helpers'
import {
  isRecaptchaLockedOut,
  setRecaptchaLockedOut,
  setRecaptchaLockedOutBackground,
  secondsUntilEndOfUtcDay,
} from './rate-limit-lockout.mts'

const LOCKOUT_KEY = 'recaptcha:assessment-lockout'

async function waitForLockout(): Promise<boolean> {
  return (
    (await pollUntilNotNull(async () => ((await isRecaptchaLockedOut()) ? true : null))) ?? false
  )
}

describe('secondsUntilEndOfUtcDay', () => {
  it('returns a full day at the start of a UTC day', () => {
    expect(secondsUntilEndOfUtcDay(new Date('2026-05-30T00:00:00.000Z'))).toBe(86_400)
  })

  it('returns the remaining seconds mid-day', () => {
    expect(secondsUntilEndOfUtcDay(new Date('2026-05-30T23:59:59.000Z'))).toBe(1)
  })

  it('clamps to at least one second at the very end of the day', () => {
    expect(secondsUntilEndOfUtcDay(new Date('2026-05-30T23:59:59.999Z'))).toBe(1)
  })
})

describe('reCAPTCHA assessment lockout', () => {
  beforeEach(async () => {
    await rateLimiterValkeyClient.del([LOCKOUT_KEY])
  })

  afterEach(async () => {
    await rateLimiterValkeyClient.del([LOCKOUT_KEY])
  })

  it('reports not locked out when the key is absent', async () => {
    expect(await isRecaptchaLockedOut()).toBe(false)
  })

  it('reports locked out after setting the lockout', async () => {
    await setRecaptchaLockedOut()
    expect(await isRecaptchaLockedOut()).toBe(true)
  })

  it('applies the lockout from the fire-and-forget wrapper', async () => {
    setRecaptchaLockedOutBackground()
    expect(await waitForLockout()).toBe(true)
  })
})
