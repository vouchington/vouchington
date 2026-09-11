import { it, expect, describe } from 'vitest'
import {
  EmailValidationError,
  EmailFormatInvalidError,
  EmailDomainInvalidError,
} from './errors.mts'

describe('errors.generated', () => {
  it('EmailValidationError has correct properties', () => {
    const error = new EmailValidationError('Test error message')

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Test error message')
    expect(error.name).toBe('EmailValidationError')
    expect(error.code).toBe('EmailValidationError')
  })

  it('EmailFormatInvalidError has correct properties', () => {
    const error = new EmailFormatInvalidError('invalid-email')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(EmailValidationError)
    expect(error.message).toBe('Invalid email format: invalid-email')
    expect(error.name).toBe('EmailFormatInvalidError')
    expect(error.code).toBe('EmailFormatInvalidError')
    expect(error.emailAddress).toBe('invalid-email')
  })

  it('EmailFormatInvalidError stores email address', () => {
    const error = new EmailFormatInvalidError('not@valid@email.com')
    expect(error.emailAddress).toBe('not@valid@email.com')
  })

  it('EmailDomainInvalidError has correct properties without reason', () => {
    const error = new EmailDomainInvalidError('bad-domain.com')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(EmailValidationError)
    expect(error.message).toBe('Invalid email domain: bad-domain.com')
    expect(error.name).toBe('EmailDomainInvalidError')
    expect(error.code).toBe('EmailDomainInvalidError')
    expect(error.domain).toBe('bad-domain.com')
  })

  it('EmailDomainInvalidError has correct properties with reason', () => {
    const error = new EmailDomainInvalidError('bad-domain.com', 'no MX records')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(EmailValidationError)
    expect(error.message).toBe('Invalid email domain: bad-domain.com (no MX records)')
    expect(error.name).toBe('EmailDomainInvalidError')
    expect(error.code).toBe('EmailDomainInvalidError')
    expect(error.domain).toBe('bad-domain.com')
  })

  it('EmailDomainInvalidError stores domain', () => {
    const error = new EmailDomainInvalidError('example.invalid', 'DNS error')
    expect(error.domain).toBe('example.invalid')
  })

  it('All error classes can be caught as Error', () => {
    const errors = [
      new EmailValidationError('base error'),
      new EmailFormatInvalidError('test@test'),
      new EmailDomainInvalidError('test.com'),
    ]

    errors.forEach(error => {
      expect(error).toBeInstanceOf(Error)
    })
  })

  it('Error hierarchy is correct', () => {
    const formatError = new EmailFormatInvalidError('test')
    const domainError = new EmailDomainInvalidError('test.com')

    expect(formatError).toBeInstanceOf(EmailValidationError)
    expect(formatError).toBeInstanceOf(Error)

    expect(domainError).toBeInstanceOf(EmailValidationError)
    expect(domainError).toBeInstanceOf(Error)
  })
})
