import { randomUUID } from 'node:crypto'
import dnsPromises from 'node:dns/promises'
import { afterEach, beforeEach, expect, it, vi, describe, type MockInstance } from 'vitest'
import { valkeyEvents } from 'valkyries'
import {
  deleteTestEmailDomainValidationCache,
  readTestEmailDomainValidationCache,
} from '@voucha/test-helpers/email-domain-validation-cache'
import { validateEmailDomain } from '../domain-validation.mts'
import { EmailDomainInvalidError } from '../errors.mts'
import { DnsTimeoutError } from '../resolve-mx.mts'

describe('domain-validation', () => {
  const ownedDomains: string[] = []
  let mockResolveMx: MockInstance<typeof dnsPromises.resolveMx>

  beforeEach(() => {
    mockResolveMx = vi.spyOn(dnsPromises, 'resolveMx')
    mockResolveMx.mockRejectedValue(new Error('Unexpected DNS provider invocation'))
  })

  afterEach(async () => {
    try {
      vi.useRealTimers()
      await deleteTestEmailDomainValidationCache(...ownedDomains.splice(0))
    } finally {
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
    mockResolveMx.mockImplementation(requestedDomain => {
      if (requestedDomain !== domain)
        return Promise.reject(new Error('Unexpected DNS fixture domain'))
      return Promise.reject(new DnsTimeoutError())
    })
    await validateWithTimeout(3)
    await validateWithTimeout(6)

    async function validateWithTimeout(expectedCalls: number): Promise<void> {
      const outcome = validateEmailDomain(domain).catch((err: unknown) => err)
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
