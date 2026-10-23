import { randomUUID } from 'node:crypto'
import dnsPromises from 'node:dns/promises'
import type { MxRecord } from 'node:dns'
import { afterEach, beforeEach, expect, it, vi, describe, type MockInstance } from 'vitest'
import { valkeyEvents } from 'valkyries'
import {
  deleteTestEmailDomainValidationCache,
  readTestEmailDomainValidationCache,
} from '@voucha/test-helpers/email-domain-validation-cache'
import {
  setResolveMxRecordsForDomainValidationTest,
  validateEmailDomain,
} from '../domain-validation.mts'
import { EmailDomainInvalidError } from '../errors.mts'
import { resolveMxRecords, type DnsLookupTimeoutCancellation } from '../resolve-mx.mts'

describe('domain-validation', () => {
  const ownedDomains: string[] = []
  let mockResolveMx: MockInstance<typeof dnsPromises.resolveMx>
  let restoreMxRecordsForValidation: (() => void) | undefined

  beforeEach(() => {
    mockResolveMx = vi.spyOn(dnsPromises, 'resolveMx')
    mockResolveMx.mockRejectedValue(new Error('Unexpected DNS provider invocation'))
    restoreMxRecordsForValidation = setResolveMxRecordsForDomainValidationTest(resolveMxRecords)
  })

  afterEach(async () => {
    try {
      vi.useRealTimers()
      await deleteTestEmailDomainValidationCache(...ownedDomains.splice(0))
    } finally {
      restoreMxRecordsForValidation?.()
      restoreMxRecordsForValidation = undefined
      mockResolveMx.mockRestore()
    }
  })

  function ownDomain(prefix: string): string {
    const domain = `${prefix}-${randomUUID()}.invalid`
    ownedDomains.push(domain)
    return domain
  }

  it('does NOT cache DnsTimeoutError — second call retries DNS again', async () => {
    const domain = ownDomain('timeout-test')
    const lookups: ReturnType<typeof Promise.withResolvers<MxRecord[]>>[] = []
    const validations: Promise<unknown>[] = []
    let disposed = false
    mockResolveMx.mockImplementation(requestedDomain => {
      if (requestedDomain !== domain) throw new Error('Unexpected DNS fixture domain')
      const lookup = Promise.withResolvers<MxRecord[]>()
      lookups.push(lookup)
      if (disposed) lookup.resolve([])
      return lookup.promise
    })
    // beforeEach installed the real resolver. Replace only this case so its timeout fires
    // on a microtask. Process-wide fake timers also capture the fork's GlideMQ worker wakes.
    restoreMxRecordsForValidation?.()
    restoreMxRecordsForValidation = setResolveMxRecordsForDomainValidationTest(requestedDomain =>
      resolveMxRecords(requestedDomain, scheduleImmediateDnsLookupTimeout),
    )
    try {
      await validateWithTimeout(3)
      await validateWithTimeout(6)
    } finally {
      disposed = true
      for (const lookup of lookups) lookup.resolve([])
      await Promise.allSettled(validations)
      await Promise.allSettled(lookups.map(lookup => lookup.promise))
    }

    async function validateWithTimeout(expectedCalls: number): Promise<void> {
      const outcome = validateEmailDomain(domain).catch((err: unknown) => err)
      validations.push(outcome)
      await expect(outcome).resolves.toBeInstanceOf(EmailDomainInvalidError)
      await expect(outcome).resolves.toMatchObject({
        domain,
        reason: 'DNS error: DNS lookup timeout',
      })
      expect(vi.isFakeTimers()).toBe(false)
      expect(mockResolveMx).toHaveBeenCalledTimes(expectedCalls)
      await expect(readTestEmailDomainValidationCache(domain)).resolves.toBeNull()
    }
  })

  it('rejects empty/whitespace domain without DNS lookup', async () => {
    // Empty normalized keys short-circuit before any internal domain validation or DNS lookup.
    await expect(validateEmailDomain('')).rejects.toThrow(EmailDomainInvalidError)
    await expect(validateEmailDomain('   ')).rejects.toThrow(EmailDomainInvalidError)
    expect(mockResolveMx).not.toHaveBeenCalled()
  })

  it('DOES cache non-timeout DNS errors — second call serves from the real cache', async () => {
    const domain = ownDomain('nxdomain-test')
    const error = Object.assign(new Error('queryMx ENOTFOUND'), { code: 'ENOTFOUND' })
    mockResolveMx.mockRejectedValue(error)

    const cacheWrite = Promise.withResolvers<void>()
    const onCacheWrite = ({ cacheName, keys }: { cacheName: string; keys: string[] }) => {
      if (cacheName.startsWith('email-domain-validation:') && keys.includes(domain))
        cacheWrite.resolve()
    }
    valkeyEvents.on('cache:set', onCacheWrite)
    try {
      await expect(validateEmailDomain(domain)).rejects.toThrow(EmailDomainInvalidError)
      expect(mockResolveMx).toHaveBeenCalledExactlyOnceWith(domain)
      await cacheWrite.promise
      await expect(readTestEmailDomainValidationCache(domain)).resolves.toMatchObject({
        success: false,
        reason: 'DNS error: queryMx ENOTFOUND',
      })
      await expect(validateEmailDomain(domain)).rejects.toThrow(EmailDomainInvalidError)
      expect(mockResolveMx).toHaveBeenCalledExactlyOnceWith(domain)
    } finally {
      valkeyEvents.off('cache:set', onCacheWrite)
    }
  })
})

// Fires the lookup timeout on the next microtask so the case does not install fake timers.
function scheduleImmediateDnsLookupTimeout(onTimeout: () => void): DnsLookupTimeoutCancellation {
  let cancelled = false
  queueMicrotask(() => {
    if (!cancelled) onTimeout()
  })
  return () => {
    cancelled = true
  }
}
