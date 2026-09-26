import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mirrors vitest.setup.sentry-mock.mts; kept local so this .mock test owns its vi.mock().
const sentryMocks = vi.hoisted(() => {
  const key = 'vouchaSentryMocks'
  const globalMocks = globalThis as typeof globalThis & {
    [key]?: {
      init: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureException: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureMessage: ReturnType<typeof vi.fn<VitestLooseMock>>
      flush: ReturnType<typeof vi.fn<VitestLooseMock>>
      addBreadcrumb: ReturnType<typeof vi.fn<VitestLooseMock>>
    }
  }
  const mocks = globalMocks[key] ?? {
    init: vi.fn<VitestLooseMock>(),
    captureException: vi.fn<VitestLooseMock>(),
    captureMessage: vi.fn<VitestLooseMock>(),
    flush: vi.fn<VitestLooseMock>(() => Promise.resolve(true)),
    addBreadcrumb: vi.fn<VitestLooseMock>(),
  }
  globalMocks[key] = mocks
  mocks.captureMessage ??= vi.fn<VitestLooseMock>()
  return mocks
})

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => ({
  ...sentryMocks,
  default: sentryMocks,
}))

const captureException = sentryMocks.captureException
const flush = sentryMocks.flush

import onError, { flushSentry } from './index.mts'
import { CrawlerNetworkError, CrawlerTimeoutError } from './errors.mts'
import {
  runWithCredentialRequestContext,
  runWithSessionRequestContext,
} from '@modules/request-client-info'

function makeErrorWithFields(fields: Record<string, unknown>): Error & Record<string, unknown> {
  const error = new Error(String(fields.message ?? 'error')) as Error & Record<string, unknown>
  for (const [key, value] of Object.entries(fields)) error[key] = value
  return error
}

describe('onError console logging', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let originalEnv: string | undefined
  let originalCI: string | undefined

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV
    originalCI = process.env.CI
    consoleSpy = vi.spyOn(console, 'error').mockReturnValue(undefined)
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    if (originalCI === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCI
    }
    vi.restoreAllMocks()
    captureException.mockReset()
    flush.mockReset()
    flush.mockResolvedValue(true)
  })

  it('logs to console in development', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    const err = new Error('something went wrong')
    onError(err)
    expect(consoleSpy).toHaveBeenCalledWith(err)
  })

  it('logs to console in CI', () => {
    process.env.NODE_ENV = 'production'
    process.env.CI = 'true'
    const err = new Error('ci failure')
    onError(err)
    expect(consoleSpy).toHaveBeenCalledWith(err)
  })

  it('enriches structured console logs from request client context', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    const err = new Error('request failed')

    runWithSessionRequestContext(
      {
        client: 'swift',
        platform: 'ios',
        appVersion: '1.2.3',
        sdkVersion: '2.0.0',
        deviceId: 'device-1',
        ipAddress: '203.0.113.1',
        requestId: 'request-1',
      },
      () => onError(err),
    )

    expect(consoleSpy).toHaveBeenCalledWith(err, {
      request_interface: 'rest',
      request_credential: 'session',
      client: 'swift',
      client_platform: 'ios',
      client_app_version: '1.2.3',
      client_sdk_version: '2.0.0',
      client_device_id: 'device-1',
      client_ip_address: '203.0.113.1',
      request_id: 'request-1',
    })
  })

  it('does not log to console in test mode', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.CI
    const err = new Error('test error')
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does not log to console in test mode even when CI=true', () => {
    process.env.NODE_ENV = 'test'
    process.env.CI = 'true'
    const err = new Error('ci test error')
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does not log to console in production without CI', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.CI
    const err = new Error('prod error')
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does not log 4xx errors', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    const err = makeErrorWithFields({ message: 'not found', status: 404 })
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does not log 4xx statusCode errors', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    const err = makeErrorWithFields({ message: 'bad request', statusCode: 400 })
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does not log ECONNRESET', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    const err = makeErrorWithFields({ message: 'connection reset', code: 'ECONNRESET' })
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does not log EPIPE', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    const err = makeErrorWithFields({ message: 'broken pipe', code: 'EPIPE' })
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does not log ignored placeholder messages', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    onError(new Error('placeholder error ignore message'))
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('throws when called with a non-error value', () => {
    expect(() => onError('boom' as unknown as Error)).toThrow(
      'onError expects an Error instance, received: string with value: boom',
    )
  })

  it('does not log errors with suppressLogging tag', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    const err = makeErrorWithFields({
      message: 'suppressed',
      tags: { suppressLogging: true },
    })
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('captures 5xx errors with Sentry tags and extra data', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.CI
    const err = makeErrorWithFields({
      message: 'server error',
      statusCode: 503,
      tags: { component: 'test' },
      extra: { requestId: 'req-1' },
    })

    onError(err)

    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { component: 'test' },
      extra: { requestId: 'req-1' },
    })
  })

  it('enriches captured errors from request client context', () => {
    const err = new Error('request failed')
    runWithSessionRequestContext(
      {
        client: 'swift',
        platform: 'ios',
        appVersion: '1.2.3',
        sdkVersion: '2.0.0',
        deviceId: 'device-1',
        ipAddress: '203.0.113.1',
        requestId: 'request-1',
      },
      () => onError(err),
    )
    expect(captureException).toHaveBeenCalledWith(err, {
      tags: {
        request_interface: 'rest',
        request_credential: 'session',
        client: 'swift',
        client_platform: 'ios',
        client_app_version: '1.2.3',
        client_sdk_version: '2.0.0',
        request_id: 'request-1',
      },
      extra: { client_device_id: 'device-1', client_ip_address: '203.0.113.1' },
    })
  })

  it('tags captured errors with a credentialed request origin', () => {
    const err = new Error('tool failed')
    runWithCredentialRequestContext(
      { interface: 'mcp', credential: 'oauth', client: null, oauthClientId: 'client-1' },
      () => onError(err),
    )
    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { request_interface: 'mcp', request_credential: 'oauth', oauth_client_id: 'client-1' },
    })
  })

  it('flushes Sentry with the configured timeout', async () => {
    flush.mockResolvedValue(true)

    await flushSentry(1234)

    expect(flush).toHaveBeenCalledWith(1234)
  })

  it('flushes Sentry with the default timeout', async () => {
    flush.mockResolvedValue(true)

    await flushSentry()

    expect(flush).toHaveBeenCalledWith(2000)
  })

  it('does not log or capture expected crawler timeout errors', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    const err = new CrawlerTimeoutError('https://example.com', 10_000, 10_000)
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('does not log or capture expected crawler DNS errors', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.CI
    const err = new CrawlerNetworkError('https://example.com', 100, new Error('ENOTFOUND'))
    onError(err)
    expect(consoleSpy).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })
})
