import { describe, expect, it } from 'vitest'
import { buildRawEmailMessage, getBccAddresses, resolveBccAddress } from './ses.mts'

describe('buildRawEmailMessage', () => {
  it('preserves Gmail one-click unsubscribe headers in multipart email', () => {
    const raw = buildRawEmailMessage({
      to: 'tests@voucha.ai',
      subject: 'Recommendations',
      text: 'Text body',
      html: '<p>HTML body</p>',
      headers: {
        'List-Unsubscribe': '<https://voucha.ai/api/v1/email-unsubscribe?token=signed>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })

    expect(raw).toContain(
      '\r\nList-Unsubscribe: <https://voucha.ai/api/v1/email-unsubscribe?token=signed>\r\n',
    )
    expect(raw).toContain('\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n')
    expect(raw).not.toContain('\r\nBcc:')
    expect(raw).toContain('Content-Type: multipart/alternative;')
    expect(raw).toContain(Buffer.from('Text body').toString('base64'))
    expect(raw).toContain(Buffer.from('<p>HTML body</p>').toString('base64'))
  })

  it.each([
    [{ html: '<p>HTML only</p>' }, 'text/html', '<p>HTML only</p>'],
    [{ text: 'Text only' }, 'text/plain', 'Text only'],
  ] as const)('builds single-part email with the matching content type', (body, type, content) => {
    const raw = buildRawEmailMessage({
      to: 'tests@voucha.ai',
      subject: 'Single part',
      ...body,
    })

    expect(raw).toContain(`Content-Type: ${type}; charset=UTF-8`)
    expect(raw).toContain(Buffer.from(content).toString('base64'))
  })

  it('normalizes body line endings for SMTP transport', () => {
    const raw = buildRawEmailMessage({
      to: 'tests@voucha.ai',
      subject: 'Line endings',
      text: 'first\nsecond\rlast',
      html: '<p>first\nsecond</p>',
    })

    expect(raw).not.toMatch(/(?<!\r)\n|\r(?!\n)/)
    expect(raw).toContain(Buffer.from('first\r\nsecond\r\nlast').toString('base64'))
    expect(raw).toContain(Buffer.from('<p>first\r\nsecond</p>').toString('base64'))
  })

  it('wraps encoded body lines within the SMTP limit', () => {
    const raw = buildRawEmailMessage({
      to: 'tests@voucha.ai',
      subject: 'Long HTML',
      html: `<p>${'content'.repeat(500)}</p>`,
    })

    expect(Math.max(...raw.split('\r\n').map(line => line.length))).toBeLessThanOrEqual(998)
  })
})

describe('resolveBccAddress', () => {
  it('prefers an explicit SES_BCC_EMAIL regardless of environment', () => {
    expect(resolveBccAddress('override@voucha.ai', true)).toBe('override@voucha.ai')
    expect(resolveBccAddress('override@voucha.ai', false)).toBe('override@voucha.ai')
  })

  it('treats an empty SES_BCC_EMAIL as unset rather than an invalid empty address', () => {
    expect(resolveBccAddress('', true)).toBe('bcc@voucha.ai')
  })

  it('uses the real production mailbox only when actually running in production', () => {
    expect(resolveBccAddress(undefined, true)).toBe('bcc@voucha.ai')
  })

  it('uses the dev mailbox everywhere else, including staging (NODE_ENV=production there too)', () => {
    expect(resolveBccAddress(undefined, false)).toBe('bcc-dev@voucha.ai')
  })
})

describe('getBccAddresses', () => {
  it('requires an explicit opt-out before omitting the global operational BCC', () => {
    expect(getBccAddresses({})).toHaveLength(1)
    expect(getBccAddresses({ allowGlobalBcc: false })).toEqual([])
  })
})
