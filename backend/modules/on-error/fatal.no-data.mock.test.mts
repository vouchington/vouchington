import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatConsoleError } from './console-format.mts'

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

describe('onFatalError console reporting', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('ENVIRONMENT', 'production')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', 'true')
    vi.stubEnv('SENTRY_DSN', '')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('logs fatal errors once even when ordinary reporting suppresses them', async () => {
    const { onFatalError } = await import('./index.mts')
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue(undefined)
    const err = Object.assign(new Error('private-ignored-fatal'), { code: 'EPIPE' })

    onFatalError(err)

    expect(consoleSpy).toHaveBeenCalledExactlyOnceWith(formatConsoleError(err))
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('private-ignored-fatal')
    expect(captureException).not.toHaveBeenCalled()
  })

  it('logs and captures a fatal error without duplicate console output', async () => {
    const { onFatalError } = await import('./index.mts')
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue(undefined)
    const err = new TypeError('private-captured-fatal')

    onFatalError(err)

    expect(consoleSpy).toHaveBeenCalledExactlyOnceWith(formatConsoleError(err))
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('private-captured-fatal')
    expect(captureException).toHaveBeenCalledExactlyOnceWith(err, {})
    expect(captureException.mock.calls[0]![0]).toBe(err)
  })

  it.each([false, true])(
    'logs a fatal error once outside CI with Sentry enabled=%s',
    async enabled => {
      vi.stubEnv('CI', '')
      vi.stubEnv('SENTRY_DSN', enabled ? 'https://public@example.test/123' : '')
      const { onFatalError } = await import('./index.mts')
      const { sentryEnabled } = await import('./sentry.mts')
      const consoleSpy = vi.spyOn(console, 'error').mockReturnValue(undefined)
      const err = new TypeError('private-deployed-fatal')
      expect(sentryEnabled).toBe(enabled)

      onFatalError(err)

      expect(consoleSpy).toHaveBeenCalledExactlyOnceWith(formatConsoleError(err))
      expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('private-deployed-fatal')
      expect(captureException).toHaveBeenCalledExactlyOnceWith(err, {})
      expect(captureException.mock.calls[0]![0]).toBe(err)
    },
  )
})
