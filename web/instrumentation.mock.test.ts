import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Sentry to avoid actual initialization
const serverConfigMock = vi.fn<VitestLooseMock>()
const edgeConfigMock = vi.fn<VitestLooseMock>()
vi.mock(import('./instrumentation'), async importActual => importActual())
vi.mock(import('./sentry-otel'), () => ({
  createOtelSpanProcessors: vi.fn<() => undefined>(() => undefined),
}))
vi.mock(import('./sentry.server.config'), () => {
  serverConfigMock()
  return {}
})
vi.mock(import('./sentry.edge.config'), () => {
  edgeConfigMock()
  return {}
})

async function registerInstrumentation(): Promise<void> {
  const { register } = await import('./instrumentation')
  await register()
}

describe('register', () => {
  const originalRuntime = process.env.NEXT_RUNTIME
  const originalOtelEnabled = process.env.OTEL_ENABLED

  beforeEach(() => {
    vi.resetModules()
    serverConfigMock.mockClear()
    edgeConfigMock.mockClear()
    delete process.env.OTEL_ENABLED
  })

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.NEXT_RUNTIME
    } else {
      process.env.NEXT_RUNTIME = originalRuntime
    }
    if (originalOtelEnabled === undefined) {
      delete process.env.OTEL_ENABLED
    } else {
      process.env.OTEL_ENABLED = originalOtelEnabled
    }
  })

  it('imports server config on nodejs runtime when OTEL_ENABLED=1', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    process.env.OTEL_ENABLED = '1'
    await registerInstrumentation()
    expect(serverConfigMock).toHaveBeenCalledOnce()
    expect(edgeConfigMock).not.toHaveBeenCalled()
  })

  it('imports edge config on edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge'
    await registerInstrumentation()
    expect(edgeConfigMock).toHaveBeenCalledOnce()
    expect(serverConfigMock).not.toHaveBeenCalled()
  })
})
