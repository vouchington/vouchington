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

  it('runs import-time initialization outside test runtimes without a mock client', async () => {
    const registry = globalThis as typeof globalThis & {
      vouchaSentryMocks?: unknown
    }
    const originalSentryMocks = registry.vouchaSentryMocks
    const originalNodeEnv = process.env.NODE_ENV
    delete registry.vouchaSentryMocks
    process.env.NODE_ENV = 'development'

    try {
      vi.resetModules()
      await vi.importActual<typeof import('./sentry.mts')>('./sentry.mts')
      expect(sentrySdkMock.init).toHaveBeenCalledOnce()
    } finally {
      registry.vouchaSentryMocks = originalSentryMocks
      process.env.NODE_ENV = originalNodeEnv
      vi.resetModules()
    }
  })
})
