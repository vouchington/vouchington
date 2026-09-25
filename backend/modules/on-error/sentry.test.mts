import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrawlerNetworkError, CrawlerTimeoutError } from './errors.mts'
import {
  createSentryInitOptions,
  filterSentryEvent,
  shouldInitializeSentry,
  type SentryMockRegistry,
} from './sentry.mts'
import { scrubSentrySpan } from './sentry-scrub.mts'

function makeEvent(eventId: string): Parameters<typeof filterSentryEvent>[0] {
  return { event_id: eventId } as Parameters<typeof filterSentryEvent>[0]
}

function makeErrorWithFields(fields: Record<string, unknown>): Error & Record<string, unknown> {
  const error = new Error(String(fields.message ?? 'error')) as Error & Record<string, unknown>
  for (const [key, value] of Object.entries(fields)) error[key] = value
  return error
}

describe('filterSentryEvent', () => {
  it('drops expected crawler timeout errors', () => {
    const event = makeEvent('crawler-timeout')
    expect(
      filterSentryEvent(event, {
        originalException: new CrawlerTimeoutError('https://example.com', 10_000, 10_000),
      }),
    ).toBeNull()
  })

  it('drops expected crawler DNS errors', () => {
    const event = makeEvent('crawler-dns')
    expect(
      filterSentryEvent(event, {
        originalException: new CrawlerNetworkError(
          'https://example.com',
          100,
          new Error('ENOTFOUND'),
        ),
      }),
    ).toBeNull()
  })

  it('keeps unknown 5xx errors', () => {
    const event = makeEvent('unknown')
    expect(filterSentryEvent(event, { originalException: new Error('boom') })).toBe(event)
  })

  it('drops events tagged to suppress logging', () => {
    const event = { ...makeEvent('suppressed'), tags: { suppressLogging: true } }
    expect(filterSentryEvent(event, { originalException: new Error('suppressed') })).toBeNull()
  })

  it('drops premature-close stream cleanup errors', () => {
    const event = makeEvent('premature-close')
    expect(filterSentryEvent(event, { originalException: new Error('Premature close') })).toBeNull()
  })

  it('drops errors with 4xx statusCode fields', () => {
    const event = makeEvent('status-code')
    expect(
      filterSentryEvent(event, {
        originalException: makeErrorWithFields({ message: 'not found', statusCode: 404 }),
      }),
    ).toBeNull()
  })

  it('drops noisy connection reset and broken pipe errors', () => {
    for (const code of ['ECONNRESET', 'EPIPE']) {
      const event = makeEvent(code)
      expect(
        filterSentryEvent(event, {
          originalException: makeErrorWithFields({ code, message: code }),
        }),
      ).toBeNull()
    }
  })

  it('keeps errors with 5xx status fields', () => {
    const event = makeEvent('server-error')
    expect(
      filterSentryEvent(event, {
        originalException: makeErrorWithFields({ message: 'server', status: 500 }),
      }),
    ).toBe(event)
  })

  it('keeps non-error exception values', () => {
    const event = makeEvent('primitive')
    expect(filterSentryEvent(event, { originalException: 'boom' })).toBe(event)
  })
})

describe('createSentryInitOptions', () => {
  it('uses SENTRY_DSN and disables deployed reporting when it is missing or invalid', () => {
    expect(createSentryInitOptions({ ENVIRONMENT: 'production' })).toMatchObject({
      dsn: undefined,
      enabled: false,
    })
    expect(
      createSentryInitOptions({
        ENVIRONMENT: 'production',
        SENTRY_DSN: 'https://public@example.test/123',
      }),
    ).toMatchObject({ dsn: 'https://public@example.test/123', enabled: true })
  })

  it('fails closed on local dev, but still wires release, dsn, and scrubbing', () => {
    const options = createSentryInitOptions({
      GIT_COMMIT: 'dev-sha',
      NODE_ENV: 'development',
    })

    expect(options.enabled).toBe(false)
    expect(options.environment).toBe('development')
    expect(options.release).toBe('dev-sha')
    expect(options.dsn).toBeUndefined()
    const scrubbed = options.beforeSend?.(
      { request: { url: 'https://example.com/x?token=secret' } } as never,
      { originalException: new Error('boom') },
    )
    expect(scrubbed).toEqual({ request: { url: 'https://example.com/x' } })
    expect(options.beforeSendSpan).toBe(scrubSentrySpan)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      expect(
        createSentryInitOptions({
          ENVIRONMENT: environment,
          SENTRY_DSN: 'https://public@example.test/123',
        }).enabled,
      ).toBe(true)
    },
  )

  it('resolves the environment tag from ENVIRONMENT, then NODE_ENV, then a development default', () => {
    expect(
      createSentryInitOptions({
        ENVIRONMENT: 'staging',
        NODE_ENV: 'production',
      }).environment,
    ).toBe('staging')
    expect(createSentryInitOptions({}).environment).toBe('development')
  })

  it('stays disabled during tests and CI', () => {
    expect(createSentryInitOptions({ NODE_ENV: 'test' }).enabled).toBe(false)
    expect(createSentryInitOptions({ CI: 'true', NODE_ENV: 'development' }).enabled).toBe(false)
  })

  it('wires the release, DSN, environment, and span scrubber for a deployed environment', () => {
    const scrubSpan = vi.fn<VitestLooseMock>()
    const options = createSentryInitOptions(
      {
        ENVIRONMENT: 'staging',
        NODE_ENV: 'test',
        GIT_COMMIT: 'abc123',
        SENTRY_DSN: 'https://public@example.test/123',
      },
      {
        scrubSentrySpan: scrubSpan,
      },
    )

    expect(options.enabled).toBe(true)
    expect(options.dsn).toBe('https://public@example.test/123')
    expect(options.environment).toBe('staging')
    expect(options.release).toBe('abc123')
    expect(options.beforeSendSpan).toBe(scrubSpan)
  })
})

describe('shouldInitializeSentry', () => {
  const registry = globalThis as SentryMockRegistry
  let originalSentryMocks: SentryMockRegistry['vouchaSentryMocks']
  let hadOriginalSentryMocks = false

  // Preserve unrelated shared-worker globals; vi.unstubAllGlobals() is too broad here.
  beforeEach(() => {
    hadOriginalSentryMocks = 'vouchaSentryMocks' in registry
    originalSentryMocks = registry.vouchaSentryMocks
    delete registry.vouchaSentryMocks
  })

  afterEach(() => {
    if (hadOriginalSentryMocks) {
      registry.vouchaSentryMocks = originalSentryMocks
    } else {
      delete registry.vouchaSentryMocks
    }
  })

  it('skips test runtimes', () => {
    expect(shouldInitializeSentry({ NODE_ENV: 'test' })).toBe(false)
  })

  it('initializes outside test runtimes', () => {
    expect(shouldInitializeSentry({ NODE_ENV: 'development' })).toBe(true)
  })

  it('skips initialization when a backend test Sentry client is registered', () => {
    const testClient = {
      addBreadcrumb: vi.fn<VitestLooseMock>(),
      captureException: vi.fn<VitestLooseMock>(),
      captureMessage: vi.fn<VitestLooseMock>(),
      flush: vi.fn<VitestLooseMock>(),
      suppressTracing: vi.fn<VitestLooseMock>(),
    }
    registry.vouchaSentryMocks = testClient

    expect(shouldInitializeSentry({ NODE_ENV: 'development' })).toBe(false)
  })
})
