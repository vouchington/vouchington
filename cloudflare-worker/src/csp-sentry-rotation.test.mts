import { describe, expect, it } from 'vitest'
import { buildWebCsp } from './csp.mts'

const buildSentryCsp = (options: {
  sentryTunnelPreviousWebDsn?: string
  sentryWebDsn?: string
}): string =>
  buildWebCsp(undefined, {
    browserUploadOrigins: '["https://test-images.s3.us-west-2.amazonaws.com"]',
    nonce: 'testnonce',
    ...options,
  })

describe('Sentry CSP rotation', () => {
  it('derives the current connect-src origin from SENTRY_WEB_DSN', () => {
    const csp = buildSentryCsp({ sentryWebDsn: 'https://public@example.test/123' })
    expect(csp).toMatch(/connect-src [^;]*https:\/\/example\.test/)
  })

  it('includes the validated retiring origin during browser DSN rotation', () => {
    const csp = buildSentryCsp({
      sentryTunnelPreviousWebDsn: 'https://retiring_public@retiring.example.test/456',
      sentryWebDsn: 'https://current_public@current.example.test/123',
    })

    expect(csp).toMatch(/connect-src [^;]*https:\/\/current\.example\.test/)
    expect(csp).toMatch(/connect-src [^;]*https:\/\/retiring\.example\.test/)
  })

  it('rejects the retiring origin without a valid replacement browser DSN', () => {
    const csp = buildSentryCsp({
      sentryTunnelPreviousWebDsn: 'https://retiring_public@retiring.example.test/456',
      sentryWebDsn: 'invalid',
    })

    expect(csp).not.toContain('https://retiring.example.test')
  })

  it('rejects an invalid retiring origin during browser DSN rotation', () => {
    const csp = buildSentryCsp({
      sentryTunnelPreviousWebDsn: 'invalid',
      sentryWebDsn: 'https://current_public@current.example.test/123',
    })

    expect(csp).not.toContain('https://retiring.example.test')
  })
})
