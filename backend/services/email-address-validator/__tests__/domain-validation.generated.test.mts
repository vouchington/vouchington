import { describe, it, expect } from 'vitest'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'
import { validateEmailDomain } from '../domain-validation.mts'
import { EmailDomainInvalidError } from '../errors.mts'
import { addDomainsToEmailBloomFilter } from '@services/urls-domains-blacklist'
import {
  insertUrlHostname,
  createTestBlacklistSource,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers'

// Tests for valid domains with MX records - shares cache
describe('valid domain validation', () => {
  installEmailDomainDnsMock()
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
  installEmailDomainDnsMock()
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
    const err = await validateEmailDomain(domain).catch(err => err)
    expect(err).toBeInstanceOf(EmailDomainInvalidError)
    expect((err as EmailDomainInvalidError).message).toContain(domain)
    expect((err as EmailDomainInvalidError).domain).toBe(domain)
  })
})

// Tests for database emailable flag - needs fresh cache
describe('database emailable flag', () => {
  installEmailDomainDnsMock()
  it('fails for domain marked as not emailable', async () => {
    const hostname = `test-not-emailable-${Date.now()}.com`
    await insertUrlHostname(hostname, { is_emailable: false })

    const err = await validateEmailDomain(hostname).catch(err => err)
    expect(err).toBeInstanceOf(EmailDomainInvalidError)
    expect((err as EmailDomainInvalidError).reason).toBe(
      'domain marked as not emailable in database',
    )
  })

  it('still requires MX records even if marked emailable', async () => {
    const hostname = `test-emailable-${Date.now()}.test`
    await insertUrlHostname(hostname, { is_emailable: true })

    // `.test` resolves to no MX records in the suite stub.
    await expect(validateEmailDomain(hostname)).rejects.toThrow(EmailDomainInvalidError)
  })
})

// Tests for blacklist functionality - needs fresh cache
describe('blacklist validation', () => {
  installEmailDomainDnsMock()
  it('fails for domain in email blacklist', async () => {
    await createTestBlacklistSource({
      type: 'email',
      name: 'test-email-blacklist',
      url: 'https://example.com/email-blacklist.txt',
    })

    const testDomain = `blacklisted-email-${Date.now()}.com`
    await insertTestDomainBlacklist(testDomain, 'test-email-blacklist')
    await addDomainsToEmailBloomFilter([testDomain])

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
    await addDomainsToEmailBloomFilter([testDomain])

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
    await addDomainsToEmailBloomFilter([testDomain])

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
    await addDomainsToEmailBloomFilter([testDomain])

    // First call - checks and caches
    await expect(validateEmailDomain(testDomain)).rejects.toThrow(EmailDomainInvalidError)

    // Second call - uses cache
    await expect(validateEmailDomain(testDomain)).rejects.toThrow(EmailDomainInvalidError)
  })
})

// Tests that disposable email domains throw with reason='disposable'
describe('disposable email blocking', () => {
  installEmailDomainDnsMock()
  it('throws EmailDomainInvalidError with reason=disposable for blacklisted domain', async () => {
    await createTestBlacklistSource({
      type: 'email',
      name: 'test-email-blacklist',
      url: 'https://example.com/email-blacklist.txt',
    })

    const testDomain = `disposable-test-${Date.now()}.com`
    await insertTestDomainBlacklist(testDomain, 'test-email-blacklist')
    await addDomainsToEmailBloomFilter([testDomain])

    const err = await validateEmailDomain(testDomain).catch(err => err)
    expect(err).toBeInstanceOf(EmailDomainInvalidError)
    expect((err as EmailDomainInvalidError).reason).toBe('disposable')
    expect((err as EmailDomainInvalidError).message).toContain('disposable')
  })
})
