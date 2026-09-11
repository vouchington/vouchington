import { afterEach, beforeEach, expect, it, vi, describe } from 'vitest'
import { invalidateEmailDomainCaches } from '@voucha/test-helpers'
import { DnsTimeoutError } from '../resolve-mx.mts'
import {
  setResolveMxRecordsForDomainValidationTest,
  validateEmailDomain,
} from '../domain-validation.mts'
import { EmailDomainInvalidError } from '../errors.mts'

const mockResolveMxRecords = vi.fn<VitestLooseMock>()

describe('domain-validation', () => {
  let restoreResolveMxRecords: (() => void) | undefined

  beforeEach(async () => {
    await invalidateEmailDomainCaches()
    mockResolveMxRecords.mockReset()
    restoreResolveMxRecords = setResolveMxRecordsForDomainValidationTest(mockResolveMxRecords)
  })

  afterEach(async () => {
    restoreResolveMxRecords?.()
    restoreResolveMxRecords = undefined
    await invalidateEmailDomainCaches()
  })

  it('does NOT cache DnsTimeoutError — second call re-resolves DNS', async () => {
    const domain = `timeout-test-${Date.now()}.invalid`
    mockResolveMxRecords.mockRejectedValue(new DnsTimeoutError())

    await expect(validateEmailDomain(domain)).rejects.toThrow(EmailDomainInvalidError)
    expect(mockResolveMxRecords).toHaveBeenCalledTimes(1)

    // Cache must NOT have stored the timeout, so DNS resolves again.
    await expect(validateEmailDomain(domain)).rejects.toThrow(EmailDomainInvalidError)
    expect(mockResolveMxRecords).toHaveBeenCalledTimes(2)
  })

  it('rejects empty/whitespace domain without DNS lookup', async () => {
    // toSerializedKey returns null for empty strings, so cacheGetByAny short-circuits
    // before invoking performDomainValidation — no DNS resolution, no DB query.
    await expect(validateEmailDomain('')).rejects.toThrow(EmailDomainInvalidError)
    await expect(validateEmailDomain('   ')).rejects.toThrow(EmailDomainInvalidError)
    expect(mockResolveMxRecords).not.toHaveBeenCalled()
  })

  it('DOES cache non-timeout DNS errors — second call serves from cache', async () => {
    const domain = `nxdomain-test-${Date.now()}.invalid`
    mockResolveMxRecords.mockRejectedValue(new Error('queryMx ENOTFOUND'))

    await expect(validateEmailDomain(domain)).rejects.toThrow(EmailDomainInvalidError)
    expect(mockResolveMxRecords).toHaveBeenCalledTimes(1)

    // Cached failure: DNS not re-resolved.
    await expect(validateEmailDomain(domain)).rejects.toThrow(EmailDomainInvalidError)
    expect(mockResolveMxRecords).toHaveBeenCalledTimes(1)
  })
})
