import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { validateEmailDomain } from '../domain-validation.mts'
import { EmailDomainInvalidError } from '../errors.mts'
import {
  rebuildEmailBloomFilter,
  deleteEmailBloomFilter,
  addDomainsToEmailBloomFilter,
} from '@services/urls-domains-blacklist'
import {
  invalidateEmailDomainCaches,
  insertUrlHostname,
  createTestBlacklistSource,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers'

// Tests for valid domains with MX records - shares cache
describe('valid domain validation', () => {
  it('succeeds for gmail.com', async () => {
    await expect(validateEmailDomain('gmail.com')).resolves.toBeUndefined()
  })

  it('caches successful validations', async () => {
    // Uses cache from previous test
    await expect(validateEmailDomain('gmail.com')).resolves.toBeUndefined()
  })

  it('succeeds for yahoo.com', async () => {
    await expect(validateEmailDomain('yahoo.com')).resolves.toBeUndefined()
  })
})

// Tests for invalid domains - shares cache for the invalid domain
describe('invalid domain validation', () => {
  const invalidDomain = 'invalid-domain-12345.test'

  it('fails for domain without MX records', async () => {
    await expect(validateEmailDomain('example.invalid')).rejects.toThrow(EmailDomainInvalidError)
  })

  it('fails for non-existent domain and caches failure', async () => {
    await expect(validateEmailDomain(invalidDomain)).rejects.toThrow(EmailDomainInvalidError)
  })

  it('uses cached failure on second call', async () => {
    // Uses cache from previous test
    await expect(validateEmailDomain(invalidDomain)).rejects.toThrow(EmailDomainInvalidError)
  })

  it('error includes domain in message', async () => {
    const domain = 'definitely-invalid-12345.test'
    const err = await validateEmailDomain(domain).catch(e => e)
    expect(err).toBeInstanceOf(EmailDomainInvalidError)
    expect((err as EmailDomainInvalidError).message).toContain(domain)
    expect((err as EmailDomainInvalidError).domain).toBe(domain)
  })
})

// Tests for database emailable flag - needs fresh cache
describe('database emailable flag', () => {
  beforeAll(async () => {
    await invalidateEmailDomainCaches()
  })

  it('fails for domain marked as not emailable', async () => {
    const hostname = `test-not-emailable-${Date.now()}.com`
    await insertUrlHostname(hostname, { emailable: false })

    await expect(validateEmailDomain(hostname)).rejects.toThrow(EmailDomainInvalidError)
  })

  it('still requires MX records even if marked emailable', async () => {
    const hostname = `test-emailable-${Date.now()}.com`
    await insertUrlHostname(hostname, { emailable: true })

    // Will fail on DNS check since hostname has no MX records
    await expect(validateEmailDomain(hostname)).rejects.toThrow(EmailDomainInvalidError)
  }, 15_000)
})

// Tests for blacklist functionality - needs fresh cache
describe('blacklist validation', () => {
  beforeAll(async () => {
    await invalidateEmailDomainCaches()
  })

  it('fails for domain in email blacklist', async () => {
    await createTestBlacklistSource({
      type: 'email',
      name: 'test-email-blacklist',
      url: 'https://example.com/email-blacklist.txt',
    })

    const testDomain = `blacklisted-email-${Date.now()}.com`
    await insertTestDomainBlacklist(testDomain, 'test-email-blacklist')

    await expect(validateEmailDomain(testDomain)).rejects.toThrow(EmailDomainInvalidError)
  })

  it('succeeds for domain in URL blacklist (not email)', async () => {
    await createTestBlacklistSource({
      type: 'url',
      name: 'test-url-blacklist',
      url: 'https://example.com/url-blacklist.txt',
    })

    // Use gmail.com - URL blacklist shouldn't affect email validation
    await insertTestDomainBlacklist('gmail.com', 'test-url-blacklist')
    await invalidateEmailDomainCaches()

    await expect(validateEmailDomain('gmail.com')).resolves.toBeUndefined()
  })

  it('checks blacklist when hostname not in url_hostnames', async () => {
    await createTestBlacklistSource({
      type: 'email',
      name: 'test-email-blacklist',
      url: 'https://example.com/email-blacklist.txt',
    })

    const testDomain = `new-blacklisted-${Date.now()}.com`
    await insertTestDomainBlacklist(testDomain, 'test-email-blacklist')

    await expect(validateEmailDomain(testDomain)).rejects.toThrow(EmailDomainInvalidError)
  })

  it('normalizes domain before checking blacklist', async () => {
    await createTestBlacklistSource({
      type: 'email',
      name: 'test-email-blacklist',
      url: 'https://example.com/email-blacklist.txt',
    })

    const testDomain = `uppercase-test-${Date.now()}.com`
    await insertTestDomainBlacklist(testDomain, 'test-email-blacklist')

    await expect(validateEmailDomain(testDomain.toUpperCase())).rejects.toThrow(
      EmailDomainInvalidError,
    )
  })

  it('caches blacklist check results', async () => {
    await createTestBlacklistSource({
      type: 'email',
      name: 'test-email-blacklist',
      url: 'https://example.com/email-blacklist.txt',
    })

    const testDomain = `cached-blacklist-${Date.now()}.com`
    await insertTestDomainBlacklist(testDomain, 'test-email-blacklist')

    // First call - checks and caches
    await expect(validateEmailDomain(testDomain)).rejects.toThrow(EmailDomainInvalidError)

    // Second call - uses cache
    await expect(validateEmailDomain(testDomain)).rejects.toThrow(EmailDomainInvalidError)
  })
})

// Tests that disposable email domains throw with reason='disposable'
describe('disposable email blocking', () => {
  beforeAll(async () => {
    await invalidateEmailDomainCaches()
  })

  it('throws EmailDomainInvalidError with reason=disposable for blacklisted domain', async () => {
    await createTestBlacklistSource({
      type: 'email',
      name: 'test-email-blacklist',
      url: 'https://example.com/email-blacklist.txt',
    })

    const testDomain = `disposable-test-${Date.now()}.com`
    await insertTestDomainBlacklist(testDomain, 'test-email-blacklist')
    await addDomainsToEmailBloomFilter([testDomain])

    const err = await validateEmailDomain(testDomain).catch(e => e)
    expect(err).toBeInstanceOf(EmailDomainInvalidError)
    expect((err as EmailDomainInvalidError).reason).toBe('disposable')
    expect((err as EmailDomainInvalidError).message).toContain('disposable')
  })
})

// Tests for bloom filter integration in domain validation
describe('bloom filter integration', () => {
  beforeAll(async () => {
    await invalidateEmailDomainCaches()
  })

  afterAll(async () => {
    await invalidateEmailDomainCaches()
    await deleteEmailBloomFilter()
  })

  it('throws for domain in email blacklist when bloom filter includes it', async () => {
    await createTestBlacklistSource({
      type: 'email',
      name: 'test-email-blacklist',
      url: 'https://example.com/email-blacklist.txt',
    })

    const testDomain = `bloom-blacklisted-${Date.now()}.com`
    await insertTestDomainBlacklist(testDomain, 'test-email-blacklist')
    await rebuildEmailBloomFilter()
    await invalidateEmailDomainCaches()

    await expect(validateEmailDomain(testDomain)).rejects.toThrow(EmailDomainInvalidError)
  })

  it('skips blacklist check when bloom filter returns false (domain not in filter)', async () => {
    // This test documents an intentional trade-off: domains added to the DB blacklist
    // after the last bloom filter rebuild will be missed by the fast path until the
    // filter is rebuilt (weekly). A 1-hour validation cache can extend that window
    // further. This is acceptable — false negatives are transient and bounded.
    //
    // Setup: rebuild the filter BEFORE inserting the domain so it is absent from the filter.
    await rebuildEmailBloomFilter()

    await createTestBlacklistSource({
      type: 'email',
      name: 'test-email-blacklist',
      url: 'https://example.com/email-blacklist.txt',
    })

    const testDomain = `bloom-bypass-${Date.now()}.com`
    await insertTestDomainBlacklist(testDomain, 'test-email-blacklist')
    await invalidateEmailDomainCaches()

    // Bloom filter returns false → fast path skips the blacklist EXISTS subquery.
    // The domain is in the DB blacklist but not the filter; it reaches DNS validation
    // instead of being caught by the blacklist check.
    const error = await validateEmailDomain(testDomain).catch(e => e)
    expect(error).toBeInstanceOf(EmailDomainInvalidError)
    expect((error as EmailDomainInvalidError).message).not.toContain('email blacklist')
  })
})
