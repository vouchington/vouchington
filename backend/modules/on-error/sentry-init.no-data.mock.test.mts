import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentrySdkMock = vi.hoisted(() => ({
  init: vi.fn<(typeof import('@sentry/node'))['init']>(),
}))

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), async importOriginal => ({
  ...(await importOriginal<typeof import('@sentry/node')>()),
  init: sentrySdkMock.init,
}))

describe('Sentry import-time initialization', () => {
  beforeEach(() => {
    sentrySdkMock.init.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('initializes the SDK with app configuration and the crawler filter', async () => {
    vi.stubEnv('CI', '')
    vi.stubEnv('ENVIRONMENT', 'production')
    vi.stubEnv('SENTRY_DSN', 'https://public@example.test/123')
    vi.stubEnv('GIT_COMMIT', 'production-sha')
    vi.stubEnv('NODE_ENV', 'production')

    await import('./sentry.mts')
    const { CrawlerNetworkError, CrawlerTimeoutError } = await import('./errors.mts')

    expect(sentrySdkMock.init).toHaveBeenCalledOnce()
    const options = sentrySdkMock.init.mock.calls[0]![0]!
    expect(options).toMatchObject({
      dsn: 'https://public@example.test/123',
      environment: 'production',
      release: 'production-sha',
    })

    const beforeSend = options.beforeSend!
    expect(
      await beforeSend(
        {
          type: undefined,
          request: { url: 'https://example.com/x?token=secret' },
        },
        { originalException: new Error('unexpected') },
      ),
    ).toEqual({
      type: undefined,
      request: { url: 'https://example.com/x' },
    })
    expect(
      await beforeSend(
        { type: undefined, event_id: 'crawler' },
        {
          originalException: new CrawlerTimeoutError('https://example.com', 10_000, 10_000),
        },
      ),
    ).toBeNull()
    expect(
      await beforeSend(
        { type: undefined, event_id: 'unknown' },
        {
          originalException: new Error('unexpected'),
        },
      ),
    ).toEqual({ type: undefined, event_id: 'unknown' })
    expect(
      await beforeSend(
        { type: undefined, event_id: 'network' },
        {
          originalException: new CrawlerNetworkError(
            'https://example.com',
            100,
            new Error('ENOTFOUND'),
          ),
        },
      ),
    ).toBeNull()
  })

  it('does not initialize when the app environment is outside the deployed allowlist', async () => {
    vi.stubEnv('CI', '')
    vi.stubEnv('ENVIRONMENT', 'development')
    vi.stubEnv('SENTRY_DSN', 'https://public@example.test/123')
    vi.stubEnv('GIT_COMMIT', 'development-sha')
    vi.stubEnv('NODE_ENV', 'production')

    await import('./sentry.mts')
    expect(sentrySdkMock.init).not.toHaveBeenCalled()
  })
})
