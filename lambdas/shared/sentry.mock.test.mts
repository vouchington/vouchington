import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { InitSentryOptions } from './sentry.mts'
import { getBeforeSend } from './sentry.mock-test-helpers.mts'

vi.mock<typeof import('@sentry/aws-serverless')>(import('@sentry/aws-serverless'), () => ({
  init: vi.fn<VitestLooseMock>(),
  captureException: vi.fn<VitestLooseMock>(),
}))

const Sentry = await import('@sentry/aws-serverless')
const { initSentry, captureException } = await import('./sentry.mts')

type BeforeSend = NonNullable<InitSentryOptions['beforeSend']>
type SentryEvent = Parameters<BeforeSend>[0]
type SentryEventHint = Parameters<BeforeSend>[1]

describe('initSentry', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalEnvironment = process.env.ENVIRONMENT
  const originalCI = process.env.CI
  const originalGitCommit = process.env.GIT_COMMIT
  const originalSentryDsn = process.env.SENTRY_DSN
  const originalSentryTracesSampleRate = process.env.SENTRY_TRACES_SAMPLE_RATE
  const originalOtelEnabled = process.env.OTEL_ENABLED

  beforeEach(() => {
    vi.mocked(Sentry.init).mockClear()
    delete process.env.ENVIRONMENT
    delete process.env.SENTRY_DSN
    delete process.env.SENTRY_TRACES_SAMPLE_RATE
    delete process.env.OTEL_ENABLED
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalEnvironment === undefined) {
      delete process.env.ENVIRONMENT
    } else {
      process.env.ENVIRONMENT = originalEnvironment
    }
    if (originalCI === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCI
    }
    if (originalGitCommit === undefined) {
      delete process.env.GIT_COMMIT
    } else {
      process.env.GIT_COMMIT = originalGitCommit
    }
    if (originalSentryDsn === undefined) {
      delete process.env.SENTRY_DSN
    } else {
      process.env.SENTRY_DSN = originalSentryDsn
    }
    if (originalSentryTracesSampleRate === undefined) {
      delete process.env.SENTRY_TRACES_SAMPLE_RATE
    } else {
      process.env.SENTRY_TRACES_SAMPLE_RATE = originalSentryTracesSampleRate
    }
    if (originalOtelEnabled === undefined) {
      delete process.env.OTEL_ENABLED
    } else {
      process.env.OTEL_ENABLED = originalOtelEnabled
    }
  })

  it('disables deployed reporting when SENTRY_DSN is missing or invalid', () => {
    process.env.ENVIRONMENT = 'production'
    initSentry({ lambdaName: 'test-lambda' })
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: undefined, enabled: false }),
    )

    process.env.SENTRY_DSN = 'https://public@example.test/123'
    initSentry({ lambdaName: 'test-lambda' })
    expect(Sentry.init).toHaveBeenLastCalledWith(
      expect.objectContaining({ dsn: 'https://public@example.test/123', enabled: true }),
    )
  })

  it('disables Sentry in test environment', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.CI
    initSentry({ lambdaName: 'test-lambda' })
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('disables Sentry in development environment', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    initSentry({ lambdaName: 'test-lambda' })
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, environment: 'development' }),
    )
  })

  it('disables Sentry when CI is set', () => {
    process.env.NODE_ENV = 'production'
    process.env.CI = 'true'
    initSentry({ lambdaName: 'test-lambda' })
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('stays disabled for bare NODE_ENV=production without an allowlisted ENVIRONMENT', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.CI
    initSentry({ lambdaName: 'test-lambda' })
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, environment: 'production' }),
    )
  })

  it.each(['staging', 'production'] as const)(
    'enables Sentry for the deployed environment %s',
    environment => {
      process.env.NODE_ENV = 'production'
      delete process.env.CI
      process.env.ENVIRONMENT = environment
      process.env.SENTRY_DSN = 'https://public@example.test/123'
      initSentry({ lambdaName: 'test-lambda' })
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, environment }),
      )
    },
  )

  it('sets GIT_COMMIT as release', () => {
    process.env.NODE_ENV = 'test'
    process.env.GIT_COMMIT = 'abc123'
    initSentry({ lambdaName: 'test-lambda' })
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ release: 'abc123' }))
  })

  it('enables local OTel-only mode without a Sentry DSN', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    process.env.OTEL_ENABLED = '1'

    initSentry({ lambdaName: 'test-lambda' })

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: undefined,
        enabled: true,
      }),
    )

    const beforeSend = getBeforeSend(vi.mocked(Sentry.init))
    expect(beforeSend({} as SentryEvent, {} as SentryEventHint)).toBeNull()
  })

  it('sets lambda name as a tag via initialScope', () => {
    process.env.NODE_ENV = 'test'
    initSentry({ lambdaName: 'image-resize' })
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        initialScope: expect.objectContaining({ tags: { lambda: 'image-resize' } }),
      }),
    )
  })

  it('composes beforeSend with the default scrubber', async () => {
    const beforeSend = vi.fn<BeforeSend>(event => ({
      ...event,
      extra: { token: 'custom-token', visible: 'safe' },
    }))
    initSentry({ lambdaName: 'test-lambda', beforeSend })
    const composedBeforeSend = getBeforeSend(vi.mocked(Sentry.init))
    const result = await composedBeforeSend({} as SentryEvent, {} as SentryEventHint)

    expect(beforeSend).toHaveBeenCalled()
    expect(result).toMatchObject({
      extra: { token: '[Filtered]', visible: 'safe' },
    })
  })

  it('preserves a lambda beforeSend drop decision', async () => {
    const beforeSend = vi.fn<BeforeSend>(() => null)
    initSentry({ lambdaName: 'test-lambda', beforeSend })
    const result = await getBeforeSend(vi.mocked(Sentry.init))(
      {} as SentryEvent,
      {} as SentryEventHint,
    )

    expect(result).toBeNull()
  })

  it('scrubs async beforeSend results', async () => {
    const beforeSend = vi.fn<BeforeSend>(event =>
      Promise.resolve({
        ...event,
        extra: { authorization: 'Bearer custom-token' },
      }),
    )
    initSentry({ lambdaName: 'test-lambda', beforeSend })
    const result = await getBeforeSend(vi.mocked(Sentry.init))(
      {} as SentryEvent,
      {} as SentryEventHint,
    )

    expect(result).toMatchObject({
      extra: { authorization: '[Filtered]' },
    })
  })

  it('leaves the DSN undefined and defaults the trace sample rate when it is unset', () => {
    process.env.NODE_ENV = 'test'
    initSentry({ lambdaName: 'test-lambda' })
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: undefined,
        tracesSampleRate: 1.0,
      }),
    )
  })

  it('uses Sentry config env vars when present', () => {
    process.env.NODE_ENV = 'test'
    process.env.SENTRY_DSN = 'https://example@o0.example.test/123'
    process.env.SENTRY_TRACES_SAMPLE_RATE = '0.25'

    initSentry({ lambdaName: 'test-lambda' })

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@o0.example.test/123',
        tracesSampleRate: 0.25,
      }),
    )
  })

  it('disables Sentry transport for blank or invalid DSNs while keeping trace defaults', () => {
    process.env.NODE_ENV = 'test'
    process.env.SENTRY_DSN = '   '
    process.env.SENTRY_TRACES_SAMPLE_RATE = '2'

    initSentry({ lambdaName: 'test-lambda' })

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: undefined,
        tracesSampleRate: 1.0,
      }),
    )
  })
})

describe('captureException', () => {
  it('forwards to Sentry.captureException', () => {
    vi.mocked(Sentry.captureException).mockClear()
    const error = new Error('cache write failed')
    captureException(error)
    expect(Sentry.captureException).toHaveBeenCalledWith(error)
  })
})
