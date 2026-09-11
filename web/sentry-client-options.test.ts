import { describe, expect, it } from 'vitest'
import { createSentryClientInitOptions } from './sentry-client-options'

const scrubSentryError = () => ({ scrubbedError: true }) as never
const scrubSentrySpan = () => ({ scrubbedSpan: true }) as never
const scrubSentryTransaction = () => ({ scrubbedTransaction: true }) as never

describe('createSentryClientInitOptions', () => {
  it('stays disabled when the runtime public config bootstrap is absent', () => {
    const options = createSentryClientInitOptions({
      getRuntimePublicConfig: () => ({}),
      scrubSentryError,
      scrubSentrySpan,
      scrubSentryTransaction,
    })

    expect(options.enabled).toBe(false)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      const options = createSentryClientInitOptions({
        getRuntimePublicConfig: () => ({ environment }),
        scrubSentryError,
        scrubSentrySpan,
        scrubSentryTransaction,
      })

      expect(options.enabled).toBe(true)
      expect(options.environment).toBe(environment)
      expect(options.beforeSend).toBe(scrubSentryError)
      expect(options.beforeSendSpan).toBe(scrubSentrySpan)
      expect(options.beforeSendTransaction).toBe(scrubSentryTransaction)
    },
  )

  it('stays disabled for a non-deployed environment value', () => {
    const options = createSentryClientInitOptions({
      getRuntimePublicConfig: () => ({ environment: 'development' }),
      scrubSentryError,
      scrubSentrySpan,
      scrubSentryTransaction,
    })

    expect(options.enabled).toBe(false)
  })
})
