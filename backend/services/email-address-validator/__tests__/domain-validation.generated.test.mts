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
})

// Tests for invalid domains - shares cache for the invalid domain
describe('invalid domain validation', () => {
  installEmailDomainDnsMock()

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
