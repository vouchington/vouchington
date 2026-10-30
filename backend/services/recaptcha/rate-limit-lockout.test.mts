import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rateLimiterValkeyClient } from '@data-stores/valkey-rate-limiter'
import { isRecaptchaLockedOut, setRecaptchaLockedOutBackground } from './rate-limit-lockout.mts'

const LOCKOUT_KEY = 'recaptcha:assessment-lockout'

async function lockoutWrite(): Promise<readonly unknown[]> {
  const writeLockout = vi.spyOn(rateLimiterValkeyClient, 'set')
  try {
    setRecaptchaLockedOutBackground()
    await writeLockout.mock.results[0]?.value
    return writeLockout.mock.calls[0] ?? []
  } finally {
    writeLockout.mockRestore()
  }
}

describe('reCAPTCHA assessment lockout expiry', () => {
  afterEach(async () => {
    vi.useRealTimers()
    await rateLimiterValkeyClient.del([LOCKOUT_KEY])
  })

  it.each([
    ['2026-05-30T00:00:00.000Z', 86_400],
    ['2026-05-30T23:59:59.000Z', 1],
    ['2026-05-30T23:59:59.999Z', 1],
  ])('stores a UTC-day TTL at %s', async (instant, seconds) => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(instant) })
    const call = await lockoutWrite()
    expect(call[0]).toBe(LOCKOUT_KEY)
    expect(call[1]).toBe('1')
    expect(call[2]).toMatchObject({ expiry: { count: seconds } })
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

  it('reports locked out after the fire-and-forget wrapper writes the key', async () => {
    await lockoutWrite()
    expect(await isRecaptchaLockedOut()).toBe(true)
  })
})
