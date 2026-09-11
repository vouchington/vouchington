import { describe, expect, it } from 'vitest'
import { resolveSentryEnablement } from '@ts-shared/utils/sentry-deployment-gate'
import { createSentryServerInitOptions } from './sentry-server-options'

const createOtelSpanProcessors = () => ['otel-processor'] as never
const scrubSentryError = () => ({ scrubbedError: true }) as never
const scrubSentrySpan = () => ({ scrubbedSpan: true }) as never
const scrubSentryTransaction = () => ({ scrubbedTransaction: true }) as never

describe('createSentryServerInitOptions', () => {
  it('enables local OTel without sending Sentry events', () => {
    const options = createSentryServerInitOptions(
      {
        NODE_ENV: 'development',
        OTEL_ENABLED: '1',
      },
      {
        createOtelSpanProcessors,
        scrubSentryError,
        scrubSentrySpan,
        scrubSentryTransaction,
      },
    )

    expect(options).toMatchObject({
      dsn: undefined,
      enabled: true,
      openTelemetrySpanProcessors: ['otel-processor'],
    })
    expect(options.beforeSend?.({} as never, {} as never)).toBeNull()
  })

  it('stays disabled outside the deployed-environment allowlist', () => {
    const options = createSentryServerInitOptions(
      { NODE_ENV: 'production' },
      { createOtelSpanProcessors, scrubSentryError, scrubSentrySpan, scrubSentryTransaction },
    )

    expect(options.enabled).toBe(false)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      const options = createSentryServerInitOptions(
        { ENVIRONMENT: environment, NODE_ENV: 'production' },
        { createOtelSpanProcessors, scrubSentryError, scrubSentrySpan, scrubSentryTransaction },
      )

      expect(options.dsn).toContain('@o4507688154824704.ingest.us.sentry.io')
      expect(options.enabled).toBe(true)
      expect(options.environment).toBe(environment)
      expect(options.beforeSend).toBe(scrubSentryError)
      expect(options.beforeSendSpan).toBe(scrubSentrySpan)
      expect(options.beforeSendTransaction).toBe(scrubSentryTransaction)
    },
  )

  it('uses the shared resolveSentryEnablement helper by default', () => {
    const options = createSentryServerInitOptions({
      ENVIRONMENT: 'staging',
      NODE_ENV: 'production',
    })

    expect(options.enabled).toBe(
      resolveSentryEnablement({ environment: 'staging', otelEnabled: false }).enabled,
    )
  })
})
