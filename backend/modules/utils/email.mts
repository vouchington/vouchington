import assert from 'http-assert'

const isTest = process.env.NODE_ENV === 'test'
const testEmailPattern = /^(tests(\+[^@]+)?@voucha\.ai|[^@]+@simulator\.amazonses\.com)$/i
const restrictedCustomHeaders = new Set([
  'from',
  'to',
  'bcc',
  'reply-to',
  'subject',
  'mime-version',
  'content-type',
])

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  headers?: Record<string, string>
  configurationSetName?: string
  source?: string
  replyToAddress?: string
  /** Set false for messages containing legal or other sensitive personal data. */
  allowGlobalBcc?: boolean
}

export function assertValidSendEmailOptions(options: SendEmailOptions): void {
  assert(options.to, 422, '.to is required')
  assert(options.subject, 422, '.subject is required')
  assert(options.text || options.html, 422, '.text or .html is required')
  assertValidHeaders(options.headers)

  if (isTest) {
    const toAddresses = Array.isArray(options.to) ? options.to : [options.to]
    assert(
      toAddresses.every(x => testEmailPattern.test(x)),
      422,
      '.to must be tests@voucha.ai, tests+<random>@voucha.ai, or <anything>@simulator.amazonses.com in test mode',
    )
  }
}

function assertValidHeaders(headers: Record<string, string> | undefined): void {
  if (!headers) return
  for (const [name, value] of Object.entries(headers)) {
    assert(/^[A-Za-z0-9-]+$/.test(name), 422, '.headers names must contain only token chars')
    assert(
      !restrictedCustomHeaders.has(name.toLowerCase()),
      422,
      `.headers must not override standard header: ${name}`,
    )
    assert(!/[\r\n]/.test(value), 422, '.headers values must not contain line breaks')
  }
}
