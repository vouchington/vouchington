import { it, expect, describe } from 'vitest'
import {
  EmailValidationError,
  EmailFormatInvalidError,
  EmailDomainInvalidError,
} from './errors.mts'

describe('email validation errors', () => {
  it('exposes the base error contract', () => {
    const error = new EmailValidationError('Test error message')
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      message: 'Test error message',
      name: 'EmailValidationError',
      code: 'EmailValidationError',
      status: 400,
    })
  })

  it('identifies the invalid email address', () => {
    const error = new EmailFormatInvalidError('invalid-email')
    expect(error).toBeInstanceOf(EmailValidationError)
    expect(error).toMatchObject({
      message: 'Invalid email format: invalid-email',
      name: 'EmailFormatInvalidError',
      code: 'EmailFormatInvalidError',
      status: 400,
      emailAddress: 'invalid-email',
    })
  })

  it('identifies the domain with an optional reason', () => {
    for (const [reason, message] of [
      [undefined, 'Invalid email domain: bad-domain.com'],
      ['no MX records', 'Invalid email domain: bad-domain.com (no MX records)'],
    ] as const) {
      const error = new EmailDomainInvalidError('bad-domain.com', reason)
      expect(error).toBeInstanceOf(EmailValidationError)
      expect(error).toMatchObject({
        message,
        name: 'EmailDomainInvalidError',
        code: 'EmailDomainInvalidError',
        status: 400,
        domain: 'bad-domain.com',
        reason,
      })
    }
  })
})
