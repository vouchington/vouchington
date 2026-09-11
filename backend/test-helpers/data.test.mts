import { describe, expect, it, vi } from 'vitest'
import { verifyPhoneNumber } from '@modules/utils'
import {
  createRandomEmailAddress,
  createRandomPhoneNumber,
  createTestExpiryWindow,
  createUniqueTestEmail,
} from './data.mts'

describe('test expiry windows', () => {
  it('creates an isolated direct-expiry window whose upper bound is now', () => {
    const window = createTestExpiryWindow()

    expect(window.beforeLowerBoundDate.getTime()).toBeLessThan(window.lowerBoundDate.getTime())
    expect(window.lowerBoundDate.getTime()).toBeLessThan(window.firstEligibleDate.getTime())
    expect(window.firstEligibleDate.getTime()).toBeLessThan(window.secondEligibleDate.getTime())
    expect(window.secondEligibleDate.getTime()).toBeLessThan(window.upperBoundDate.getTime())
    expect(window.now).toEqual(window.upperBoundDate)
    expect(window.now).not.toBe(window.upperBoundDate)
    expect(window.afterUpperBoundDate.getTime()).toBeGreaterThan(window.now.getTime())
  })
})

describe('test email helpers', () => {
  it('creates readable validator-safe unique emails', () => {
    const email = createUniqueTestEmail('Login Flow')
    expect(email).toMatch(/^tests\+login-flow-[a-z0-9]{12}@voucha\.ai$/)
    expect(email.split('@')[0]!.length).toBeLessThanOrEqual(64)
  })

  it('bounds and normalizes unsafe prefixes', () => {
    const longEmail = createUniqueTestEmail(`  Unsafe___PREFIX ${'x'.repeat(100)} !!!`)
    const fallbackEmail = createUniqueTestEmail('!@#$')

    expect(longEmail).toMatch(/^tests\+unsafe-prefix-x+-[a-z0-9]{12}@voucha\.ai$/)
    expect(longEmail.split('@')[0]!.length).toBe(64)
    expect(fallbackEmail).toMatch(/^tests\+test-[a-z0-9]{12}@voucha\.ai$/)
  })

  it('remains unique during rapid same-millisecond calls', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-11T00:00:00.000Z'))
    try {
      const emails = Array.from({ length: 100 }, () => createUniqueTestEmail('same-ms'))
      expect(new Set(emails)).toHaveLength(100)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps createRandomEmailAddress on the canonical format', () => {
    expect(createRandomEmailAddress()).toMatch(/^tests\+random-[a-z0-9]{12}@voucha\.ai$/)
  })
})

describe('test phone helpers', () => {
  it('creates raw NANP phone numbers', () => {
    const phoneNumbers = Array.from({ length: 25 }, () => createRandomPhoneNumber())

    for (const phoneNumber of phoneNumbers) {
      expect(phoneNumber).toMatch(/^[2-9]\d{2}[2-9]\d{6}$/)
    }
  })

  it('creates phone numbers accepted by the canonical verifier', () => {
    const phoneNumbers = Array.from({ length: 25 }, () => createRandomPhoneNumber())

    for (const phoneNumber of phoneNumbers) {
      expect(() => verifyPhoneNumber(phoneNumber)).not.toThrow()
    }
  })
})
