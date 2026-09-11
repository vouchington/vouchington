import { describe, it, expect, beforeAll } from 'vitest'
import { validateEmailAddress } from './validate.mts'
import { EmailFormatInvalidError, EmailDomainInvalidError } from './errors.mts'
import {
  invalidateEmailDomainCaches,
  insertEmailAddressLoginToken,
  insertUrlHostname,
} from '@voucha/test-helpers'

// Tests for format validation - no DNS, no cache needed
describe('format validation', () => {
  it('fails for invalid email format', async () => {
    await expect(validateEmailAddress('not-an-email')).rejects.toThrow(EmailFormatInvalidError)
  })

  it('fails for email without @', async () => {
    await expect(validateEmailAddress('nodomain.com')).rejects.toThrow(EmailFormatInvalidError)
  })

  it('fails for email without domain', async () => {
    await expect(validateEmailAddress('user@')).rejects.toThrow(EmailFormatInvalidError)
  })

  it('fails for email without local part', async () => {
    await expect(validateEmailAddress('@voucha.ai')).rejects.toThrow(EmailFormatInvalidError)
  })

  it('fails for completely invalid format', async () => {
    await expect(validateEmailAddress('invalid')).rejects.toThrow(EmailFormatInvalidError)
  })

  it('fails for multiple @ symbols', async () => {
    await expect(validateEmailAddress('tests+user@@voucha.ai')).rejects.toThrow(
      EmailFormatInvalidError,
    )
  })

  it('fails for empty string', async () => {
    await expect(validateEmailAddress('')).rejects.toThrow(EmailFormatInvalidError)
  })

  it('fails for whitespace-only string', async () => {
    await expect(validateEmailAddress('   ')).rejects.toThrow(EmailFormatInvalidError)
  })

  it('error includes email address', async () => {
    const err = await validateEmailAddress('invalid-format').catch(e => e)
    expect(err).toBeInstanceOf(EmailFormatInvalidError)
    expect((err as EmailFormatInvalidError).message).toContain('invalid-format')
  })
})

// Tests for normalization using gmail.com (shares DNS cache)
describe('email normalization', () => {
  it('succeeds for valid email with valid domain', async () => {
    const result = await validateEmailAddress('user@gmail.com')
    expect(result).toBe('user@gmail.com')
  })

  it('normalizes email to lowercase', async () => {
    const result = await validateEmailAddress('USER@GMAIL.COM')
    expect(result).toBe('user@gmail.com')
  })

  it('normalizes mixed case email', async () => {
    const result = await validateEmailAddress('UsEr@GmAiL.cOm')
    expect(result).toBe('user@gmail.com')
  })

  it('trims whitespace', async () => {
    const result = await validateEmailAddress('  user@gmail.com  ')
    expect(result).toBe('user@gmail.com')
  })

  it('handles uppercase with whitespace', async () => {
    const result = await validateEmailAddress('  USER@GMAIL.COM  ')
    expect(result).toBe('user@gmail.com')
  })

  it('handles complex valid email formats', async () => {
    const result = await validateEmailAddress('first.last@gmail.com')
    expect(result).toBe('first.last@gmail.com')
  })

  it('removes plus sign in a deployed environment', async () => {
    const result = await validateEmailAddress('user+test@gmail.com', {
      ENVIRONMENT: 'production',
    })
    expect(result).toBe('user@gmail.com')
  })

  it('keeps plus sign in a non-deployed environment', async () => {
    const result = await validateEmailAddress('user+test@gmail.com', {
      ENVIRONMENT: 'development',
    })
    expect(result).toBe('user+test@gmail.com')
  })
})

// Tests for domain validation - uses a single invalid domain
describe('domain validation', () => {
  it('fails for domain without MX records', async () => {
    await expect(validateEmailAddress('user@invalid-domain-12345.test')).rejects.toThrow(
      EmailDomainInvalidError,
    )
  })

  it('error includes domain for domain errors', async () => {
    // Reuse the cached invalid domain from previous test
    const err = await validateEmailAddress('user2@invalid-domain-12345.test').catch(e => e)
    expect(err).toBeInstanceOf(EmailDomainInvalidError)
    expect((err as EmailDomainInvalidError).domain).toBe('invalid-domain-12345.test')
  })

  it('works with subdomains that have MX records', async () => {
    const result = await validateEmailAddress('user@googlemail.com')
    expect(result).toBe('user@googlemail.com')
  })

  it('uses cache for domain validation', async () => {
    // Uses cache from previous gmail.com tests
    const result = await validateEmailAddress('user@yahoo.com')
    expect(result).toBe('user@yahoo.com')
  })
})

// Tests requiring database setup - isolated with fresh cache
describe('database integration', () => {
  beforeAll(async () => {
    await invalidateEmailDomainCaches()
  })

  it('skips domain validation for previously logged-in email', async () => {
    const email = `test-logged-in-${Date.now()}@invalid-but-logged-in.test`
    const token = `TEST123-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    await insertEmailAddressLoginToken(email, token, true)

    const result = await validateEmailAddress(email)
    expect(result).toBe(email)
  })

  it('does NOT skip validation for email with token but not logged in', async () => {
    const email = `test-not-logged-${Date.now()}@invalid-not-logged.test`
    const token = `TEST456-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    await insertEmailAddressLoginToken(email, token, false)

    await expect(validateEmailAddress(email)).rejects.toThrow(EmailDomainInvalidError)
  }, 15_000)

  it('handles uppercase email with early return', async () => {
    const email = `TEST-LOGGED-${Date.now()}@INVALID.TEST`
    const normalized = email.toLowerCase()
    const token = `TEST789-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    await insertEmailAddressLoginToken(normalized, token, true)

    const result = await validateEmailAddress(email)
    expect(result).toBe(normalized)
  })

  it('validates domain from database emailable=false', async () => {
    const hostname = `test-blocked-${Date.now()}.com`
    await insertUrlHostname(hostname, { emailable: false })

    await expect(validateEmailAddress(`user@${hostname}`)).rejects.toThrow(EmailDomainInvalidError)
  })
})
