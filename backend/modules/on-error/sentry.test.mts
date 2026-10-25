import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrawlerNetworkError, CrawlerTimeoutError } from './errors.mts'
import {
  createSentryInitOptions,
  shouldInitializeSentry,
  type SentryMockRegistry,
} from './sentry.mts'

type BeforeSend = NonNullable<ReturnType<typeof createSentryInitOptions>['beforeSend']>

function filter(error: unknown): ReturnType<BeforeSend> {
  const options = createSentryInitOptions({ ENVIRONMENT: 'production' })
  return options.beforeSend({ event_id: 'e' } as never, { originalException: error })
}

describe('createSentryInitOptions', () => {
  it('drops expected crawler operational errors but keeps unknown 5xx errors', async () => {
    expect(await filter(new CrawlerTimeoutError('https://example.com', 10_000, 10_000))).toBeNull()
    expect(
      await filter(new CrawlerNetworkError('https://example.com', 100, new Error('ENOTFOUND'))),
    ).toBeNull()
    expect(await filter(new Error('boom'))).toEqual({ event_id: 'e' })
  })

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

  it('fails closed on local dev, but still wires release and scrubbing', () => {
    const options = createSentryInitOptions({ GIT_COMMIT: 'dev-sha', NODE_ENV: 'development' })

    expect(options.enabled).toBe(false)
    expect(options.environment).toBe('development')
    expect(options.release).toBe('dev-sha')
    expect(options.dsn).toBeUndefined()
    const scrubbed = options.beforeSend(
      { request: { url: 'https://example.com/x?token=secret' } } as never,
      { originalException: new Error('boom') },
    )
    expect(scrubbed).toEqual({ request: { url: 'https://example.com/x' } })
  })

  it('resolves the environment tag from ENVIRONMENT, then NODE_ENV, then a development default', () => {
    expect(
      createSentryInitOptions({ ENVIRONMENT: 'staging', NODE_ENV: 'production' }).environment,
    ).toBe('staging')
    expect(createSentryInitOptions({}).environment).toBe('development')
  })

  it('stays disabled during tests and CI', () => {
    expect(createSentryInitOptions({ NODE_ENV: 'test' }).enabled).toBe(false)
    expect(createSentryInitOptions({ CI: 'true', NODE_ENV: 'development' }).enabled).toBe(false)
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
