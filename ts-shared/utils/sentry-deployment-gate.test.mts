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
      }),
    ).toMatchObject({ configurationInvalid: true, enabled: false, sentryDsn: undefined })
  })

  it.each(['staging', 'production'] as const)('allows the deployed environment %s', environment => {
    const result = resolveSentryEnablement({ environment })
    expect(result).toEqual({ enabled: true, environment })
  })

  it.each([undefined, 'test', 'development', 'ci-main', ''])('fails closed for %s', environment => {
    expect(resolveSentryEnablement({ environment }).enabled).toBe(false)
  })

  it.each(['Staging', 'PRODUCTION', 'sTaGiNg'])(
    'allows the deployed environment %s case-insensitively',
    environment => {
      const result = resolveSentryEnablement({ environment })
      expect(result.enabled).toBe(true)
      expect(result.environment).toBe(environment)
    },
  )
})
