import { describe, expect, it } from 'vitest'
import { createSentryEdgeInitOptions } from './sentry-edge-options'

const scrubSentryError = () => ({ scrubbedError: true }) as never
const scrubSentrySpan = () => ({ scrubbedSpan: true }) as never

describe('createSentryEdgeInitOptions', () => {
  it('uses SENTRY_DSN and disables deployed reporting when it is missing or invalid', () => {
    expect(
      createSentryEdgeInitOptions({ ENVIRONMENT: 'production', NODE_ENV: 'production' }),
    ).toMatchObject({
      dsn: undefined,
      enabled: false,
    })
    expect(
      createSentryEdgeInitOptions({
        ENVIRONMENT: 'production',
        NODE_ENV: 'production',
        SENTRY_DSN: 'https://public@example.test/123',
      }),
    ).toMatchObject({ dsn: 'https://public@example.test/123', enabled: true })
  })

  it('turns off HTTP body capture and gen-AI input and output recording', () => {
    const expected: ReturnType<typeof createSentryEdgeInitOptions>['dataCollection'] = {
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
    }

    expect(createSentryEdgeInitOptions({ NODE_ENV: 'production' }).dataCollection).toEqual(expected)
  })

  it('stays disabled outside the deployed-environment allowlist', () => {
    const options = createSentryEdgeInitOptions(
      { NODE_ENV: 'production' },
      { scrubSentryError, scrubSentrySpan },
    )

    expect(options.enabled).toBe(false)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      const options = createSentryEdgeInitOptions(
        {
          ENVIRONMENT: environment,
          NODE_ENV: 'production',
          SENTRY_DSN: 'https://public@example.test/123',
        },
        { scrubSentryError, scrubSentrySpan },
      )

      expect(options.dsn).toBe('https://public@example.test/123')
      expect(options.enabled).toBe(true)
      expect(options.environment).toBe(environment)
      expect(options.beforeSend).toBe(scrubSentryError)
      expect(options.beforeSendSpan).toBe(scrubSentrySpan)
    },
  )
})
