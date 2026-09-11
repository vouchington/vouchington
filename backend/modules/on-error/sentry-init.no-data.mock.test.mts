import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentrySdkMock = vi.hoisted(() => ({
  addBreadcrumb: vi.fn<VitestLooseMock>(),
  captureException: vi.fn<VitestLooseMock>(),
  captureMessage: vi.fn<VitestLooseMock>(),
  flush: vi.fn<VitestLooseMock>(() => Promise.resolve(true)),
  init: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => sentrySdkMock)

describe('sentry import-time initialization', () => {
  beforeEach(() => {
    sentrySdkMock.init.mockReset()
  })

  it('evaluates the initialization guard with the backend mock client registered', async () => {
    const registry = globalThis as typeof globalThis & { vouchaSentryMocks?: unknown }
    expect(registry.vouchaSentryMocks).toBeDefined()

    vi.resetModules()
    const sentry = await vi.importActual<typeof import('./sentry.mts')>('./sentry.mts')

    expect(sentry.shouldInitializeSentry()).toBe(false)
    expect(sentrySdkMock.init).not.toHaveBeenCalled()
  })

  it('runs import-time initialization when test runtimes opt into OTel-only mode', async () => {
    const registry = globalThis as typeof globalThis & {
      vouchaSentryMocks?: unknown
    }
    const originalSentryMocks = registry.vouchaSentryMocks
    const originalOtelEnabled = process.env.OTEL_ENABLED
    const originalNodeOptions = process.env.NODE_OPTIONS
    const originalExecArgv = [...process.execArgv]
    delete registry.vouchaSentryMocks
    process.env.OTEL_ENABLED = '1'
    delete process.env.NODE_OPTIONS
    process.execArgv.length = 0

    try {
      vi.resetModules()
      await vi.importActual<typeof import('./sentry.mts')>('./sentry.mts')
      expect(sentrySdkMock.init).toHaveBeenCalledOnce()
    } finally {
      registry.vouchaSentryMocks = originalSentryMocks
      process.execArgv.splice(0, process.execArgv.length, ...originalExecArgv)
      if (originalOtelEnabled === undefined) {
        delete process.env.OTEL_ENABLED
      } else {
        process.env.OTEL_ENABLED = originalOtelEnabled
      }
      if (originalNodeOptions === undefined) {
        delete process.env.NODE_OPTIONS
      } else {
        process.env.NODE_OPTIONS = originalNodeOptions
      }
      vi.resetModules()
    }
  })
})
