import { it, expect, describe } from 'vitest'
import { EmailFormatInvalidError, EmailDomainInvalidError } from './errors.mts'

describe('email validation errors', () => {
  it('identifies the invalid email address', () => {
    const error = new EmailFormatInvalidError('invalid-email')
    expect(error).toBeInstanceOf(Error)
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
      expect(error).toBeInstanceOf(Error)
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
