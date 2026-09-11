export class EmailValidationError extends Error {
  code: string
  status: number

  constructor(message: string) {
    super(message)
    this.name = 'EmailValidationError'
    this.code = 'EmailValidationError'
    this.status = 400
  }
}

export class EmailFormatInvalidError extends EmailValidationError {
  emailAddress: string

  constructor(emailAddress: string) {
    super(`Invalid email format: ${emailAddress}`)
    this.name = 'EmailFormatInvalidError'
    this.code = 'EmailFormatInvalidError'
    this.status = 400
    this.emailAddress = emailAddress
  }
}

export class EmailDomainInvalidError extends EmailValidationError {
  domain: string
  reason: string | undefined

  constructor(domain: string, reason?: string) {
    super(`Invalid email domain: ${domain}${reason ? ` (${reason})` : ''}`)
    this.name = 'EmailDomainInvalidError'
    this.code = 'EmailDomainInvalidError'
    this.status = 400
    this.domain = domain
    this.reason = reason
  }
}
