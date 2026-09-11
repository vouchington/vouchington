import { describe, expect, it } from 'vitest'
import { createSentryEdgeInitOptions } from './sentry-edge-options'

const scrubSentryError = () => ({ scrubbedError: true }) as never
const scrubSentrySpan = () => ({ scrubbedSpan: true }) as never
const scrubSentryTransaction = () => ({ scrubbedTransaction: true }) as never

describe('createSentryEdgeInitOptions', () => {
  it('enables local OTel without sending Sentry events', () => {
    const options = createSentryEdgeInitOptions(
      { NODE_ENV: 'development', OTEL_ENABLED: '1' },
      { scrubSentryError, scrubSentrySpan, scrubSentryTransaction },
    )

    expect(options).toMatchObject({ dsn: undefined, enabled: true })
    expect(options.beforeSend?.({} as never, {} as never)).toBeNull()
  })

  it('stays disabled outside the deployed-environment allowlist', () => {
    const options = createSentryEdgeInitOptions(
      { NODE_ENV: 'production' },
      { scrubSentryError, scrubSentrySpan, scrubSentryTransaction },
    )

    expect(options.enabled).toBe(false)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      const options = createSentryEdgeInitOptions(
        { ENVIRONMENT: environment, NODE_ENV: 'production' },
        { scrubSentryError, scrubSentrySpan, scrubSentryTransaction },
      )

      expect(options.dsn).toContain('@o4507688154824704.ingest.us.sentry.io')
      expect(options.enabled).toBe(true)
      expect(options.environment).toBe(environment)
      expect(options.beforeSend).toBe(scrubSentryError)
      expect(options.beforeSendSpan).toBe(scrubSentrySpan)
      expect(options.beforeSendTransaction).toBe(scrubSentryTransaction)
    },
  )
})
