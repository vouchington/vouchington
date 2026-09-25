import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Sentry to avoid actual initialization
const serverConfigMock = vi.fn<VitestLooseMock>()
const edgeConfigMock = vi.fn<VitestLooseMock>()
vi.mock(import('./instrumentation'), async importActual => importActual())
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

  beforeEach(() => {
    vi.resetModules()
    serverConfigMock.mockClear()
    edgeConfigMock.mockClear()
  })

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.NEXT_RUNTIME
    } else {
      process.env.NEXT_RUNTIME = originalRuntime
    }
  })

  it('imports server config on nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
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
