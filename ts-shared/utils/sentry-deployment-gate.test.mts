import { describe, expect, it } from 'vitest'
import {
  getSentryDsnConfig,
  resolveSentryDsnEnablement,
  resolveSentryEnablement,
} from './sentry-deployment-gate.mts'

describe('resolveSentryEnablement', () => {
  it('normalizes a configured HTTPS Sentry DSN and derives its forwarding endpoint', () => {
    expect(getSentryDsnConfig(' https://public@example.test/123 ')).toEqual({
      dsn: 'https://public@example.test/123',
      envelopeUrl: 'https://example.test/api/123/envelope/',
      origin: 'https://example.test',
      projectId: '123',
    })
  })

  it('retains a Sentry path prefix when deriving the forwarding endpoint', () => {
    expect(getSentryDsnConfig('https://public@example.test/sentry/123')).toEqual({
      dsn: 'https://public@example.test/sentry/123',
      envelopeUrl: 'https://example.test/sentry/api/123/envelope/',
      origin: 'https://example.test',
      projectId: '123',
    })
  })

  it.each([
    'https://public@example.test/123/',
    'https://public@example.test//123',
    'https://public@example.test/sentry//123',
  ])('rejects noncanonical path spelling: %s', dsn => {
    expect(getSentryDsnConfig(dsn)).toBeUndefined()
  })

  it.each([
    undefined,
    '',
    'http://public@example.test/1',
    'https://example.test/1',
    'https://foo-bar@example.test/1',
    'https://public:secret@example.test/1',
    'https://public@example.test/not-a-project',
  ])('rejects an invalid Sentry DSN: %s', dsn => {
    expect(getSentryDsnConfig(dsn)).toBeUndefined()
  })

  it('fails closed when a deployed runtime has no valid Sentry DSN', () => {
    expect(
      resolveSentryDsnEnablement({
        dsn: undefined,
        environment: 'production',
        otelEnabled: false,
      }),
    ).toMatchObject({ configurationInvalid: true, enabled: false, sentryDsn: undefined })
  })

  it.each(['staging', 'production'] as const)('allows the deployed environment %s', environment => {
    const result = resolveSentryEnablement({ environment, otelEnabled: false })
    expect(result).toEqual({ enabled: true, environment, otelOnly: false })
  })

  it.each([undefined, 'test', 'development', 'ci-main', ''])('fails closed for %s', environment => {
    const result = resolveSentryEnablement({ environment, otelEnabled: false })
    expect(result.enabled).toBe(false)
    expect(result.otelOnly).toBe(false)
  })

  it.each(['Staging', 'PRODUCTION', 'sTaGiNg'])(
    'allows the deployed environment %s case-insensitively',
    environment => {
      const result = resolveSentryEnablement({ environment, otelEnabled: false })
      expect(result.enabled).toBe(true)
      expect(result.environment).toBe(environment)
    },
  )

  it('stays enabled with no Sentry transport when OTel-only mode opts in outside a deployed environment', () => {
    const result = resolveSentryEnablement({ environment: 'development', otelEnabled: true })
    expect(result).toEqual({ enabled: true, environment: 'development', otelOnly: true })
  })

  it('prefers deployed-environment reporting over OTel-only mode when both apply', () => {
    const result = resolveSentryEnablement({ environment: 'staging', otelEnabled: true })
    expect(result).toEqual({ enabled: true, environment: 'staging', otelOnly: false })
  })
})
