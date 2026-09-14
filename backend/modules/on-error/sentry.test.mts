import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrawlerNetworkError, CrawlerTimeoutError } from './errors.mts'
import {
  createSentryInitOptions,
  filterSentryEvent,
  hasExternalOtelAutoInstrumentationPreload,
  shouldInitializeSentry,
  type SentryMockRegistry,
} from './sentry.mts'
import { createOtelSpanProcessors } from './sentry-otel.mts'
import { scrubSentrySpan, scrubSentryTransaction } from './sentry-scrub.mts'

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

describe('createOtelSpanProcessors', () => {
  it('does not create span processors when OTel is disabled', () => {
    expect(createOtelSpanProcessors({ OTEL_ENABLED: '0' })).toBeUndefined()
  })

  it('creates an OTLP span processor when OTel is enabled', () => {
    expect(
      createOtelSpanProcessors({
        OTEL_ENABLED: '1',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
      }),
    ).toHaveLength(1)
  })
})

describe('createSentryInitOptions', () => {
  it('uses SENTRY_DSN and disables deployed reporting when it is missing or invalid', () => {
    expect(createSentryInitOptions({ ENVIRONMENT: 'production', OTEL_ENABLED: '0' })).toMatchObject(
      {
        dsn: undefined,
        enabled: false,
      },
    )
    expect(
      createSentryInitOptions({
        ENVIRONMENT: 'production',
        OTEL_ENABLED: '0',
        SENTRY_DSN: 'https://public@example.test/123',
      }),
    ).toMatchObject({ dsn: 'https://public@example.test/123', enabled: true })
  })

  it('fails closed on local dev, but still wires release, dsn, and scrubbing', () => {
    const options = createSentryInitOptions({
      GIT_COMMIT: 'dev-sha',
      NODE_ENV: 'development',
      OTEL_ENABLED: '0',
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
    expect(options.beforeSendTransaction).toBe(scrubSentryTransaction)
  })

  it.each(['staging', 'production'] as const)(
    'enables reporting for the deployed environment %s',
    environment => {
      expect(
        createSentryInitOptions({
          ENVIRONMENT: environment,
          OTEL_ENABLED: '0',
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
        OTEL_ENABLED: '0',
      }).environment,
    ).toBe('staging')
    expect(createSentryInitOptions({ OTEL_ENABLED: '0' }).environment).toBe('development')
  })

  it('stays disabled during tests and non-opted-in CI', () => {
    expect(createSentryInitOptions({ NODE_ENV: 'test', OTEL_ENABLED: '0' }).enabled).toBe(false)
    expect(
      createSentryInitOptions({ CI: 'true', NODE_ENV: 'development', OTEL_ENABLED: '0' }).enabled,
    ).toBe(false)
  })

  it('enables local OTel-only mode without a Sentry DSN', () => {
    const options = createSentryInitOptions({
      NODE_ENV: 'test',
      OTEL_ENABLED: '1',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    })

    expect(options.enabled).toBe(true)
    expect(options.dsn).toBeUndefined()
    expect(options.openTelemetrySpanProcessors).toHaveLength(1)
    expect(
      options.beforeSend?.(makeEvent('otel-only'), { originalException: new Error('boom') }),
    ).toBeNull()
  })

  it('lets deployed-environment reporting win over OTel-only mode when both apply', () => {
    const spanProcessors = [{ name: 'processor' }] as unknown as ReturnType<
      typeof createOtelSpanProcessors
    >
    const createSpanProcessors = () => spanProcessors
    const scrubSpan = vi.fn<VitestLooseMock>()
    const scrubTransaction = vi.fn<VitestLooseMock>()
    const options = createSentryInitOptions(
      {
        ENVIRONMENT: 'staging',
        NODE_ENV: 'test',
        OTEL_ENABLED: '1',
        GIT_COMMIT: 'abc123',
        SENTRY_DSN: 'https://public@example.test/123',
      },
      {
        createOtelSpanProcessors: createSpanProcessors,
        scrubSentrySpan: scrubSpan,
        scrubSentryTransaction: scrubTransaction,
      },
    )

    expect(options.enabled).toBe(true)
    expect(options.dsn).toBe('https://public@example.test/123')
    expect(options.environment).toBe('staging')
    expect(options.release).toBe('abc123')
    expect(options.openTelemetrySpanProcessors).toBe(spanProcessors)
    expect(options.beforeSendSpan).toBe(scrubSpan)
    expect(options.beforeSendTransaction).toBe(scrubTransaction)
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

  it('skips unopted-in test runtimes', () => {
    expect(shouldInitializeSentry({ NODE_ENV: 'test' }, false)).toBe(false)
  })

  it('initializes OTel-only test runtimes unless an external OTel preload owns instrumentation', () => {
    expect(shouldInitializeSentry({ NODE_ENV: 'test', OTEL_ENABLED: '1' }, false)).toBe(true)
    expect(shouldInitializeSentry({ NODE_ENV: 'test', OTEL_ENABLED: '1' }, true)).toBe(false)
  })

  it('skips initialization when a backend test Sentry client is registered', () => {
    const testClient = {
      addBreadcrumb: vi.fn<VitestLooseMock>(),
      captureException: vi.fn<VitestLooseMock>(),
      captureMessage: vi.fn<VitestLooseMock>(),
      flush: vi.fn<VitestLooseMock>(),
    }
    registry.vouchaSentryMocks = testClient

    expect(shouldInitializeSentry({ NODE_ENV: 'test', OTEL_ENABLED: '1' }, false)).toBe(false)
  })
})

describe('hasExternalOtelAutoInstrumentationPreload', () => {
  it('detects the generic auto-instrumentation preload from execArgv or NODE_OPTIONS', () => {
    expect(
      hasExternalOtelAutoInstrumentationPreload({
        execArgv: ['--import', '@opentelemetry/auto-instrumentations-node/register'],
      }),
    ).toBe(true)
    expect(
      hasExternalOtelAutoInstrumentationPreload({
        execArgv: [],
        nodeOptions: '--import @opentelemetry/auto-instrumentations-node/register',
      }),
    ).toBe(true)
  })

  it('does not treat the Sentry preload as external auto-instrumentation', () => {
    expect(
      hasExternalOtelAutoInstrumentationPreload({
        execArgv: ['--import', './backend/modules/on-error/sentry-preload.mts'],
      }),
    ).toBe(false)
  })
})
