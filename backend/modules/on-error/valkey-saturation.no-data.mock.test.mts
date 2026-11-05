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
  mocks.addBreadcrumb ??= vi.fn<VitestLooseMock>()
  return mocks
})

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => ({
  ...sentryMocks,
  default: sentryMocks,
}))

const { captureMessage, addBreadcrumb } = sentryMocks

const context = {
  client: 'private-client-sentinel',
  command: 'private-command-sentinel',
  attempt: 2,
}

describe('recordValkeySaturation console privacy', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'staging')
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('SENTRY_DSN', undefined)
    vi.stubEnv('CI', undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('omits deployed client and command strings while retaining the original Sentry context', async () => {
    const { recordValkeySaturation } = await import('./valkey-saturation.mts')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    recordValkeySaturation(context)

    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith('[valkey] inflight saturation retry', {
      attempt: 2,
    })
    const output = JSON.stringify(consoleWarn.mock.calls)
    expect(output).not.toContain(context.client)
    expect(output).not.toContain(context.command)
    expect(addBreadcrumb).toHaveBeenCalledExactlyOnceWith({
      category: 'valkey',
      message: 'inflight saturation retry',
      level: 'warning',
      data: context,
    })
    expect(captureMessage).toHaveBeenCalledExactlyOnceWith('valkey_inflight_saturation', {
      level: 'warning',
      tags: {
        reason: 'valkey_inflight_saturation',
        client: context.client,
        command: context.command,
      },
      extra: { attempt: 2 },
    })
  })

  it.each([
    ['development', ''],
    ['production', 'true'],
  ])('retains full ordinary console context in %s with CI=%s', async (environment, ci) => {
    vi.stubEnv('NODE_ENV', environment)
    vi.stubEnv('CI', ci)
    const { recordValkeySaturation } = await import('./valkey-saturation.mts')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    recordValkeySaturation(context)

    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(
      '[valkey] inflight saturation retry',
      context,
    )
  })
})
