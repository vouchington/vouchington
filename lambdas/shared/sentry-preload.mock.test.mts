import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { preloadOpenTelemetry } = vi.hoisted(() => ({
  preloadOpenTelemetry: vi.fn<() => void>(),
}))

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => ({
  preloadOpenTelemetry,
}))

describe('sentry-preload', () => {
  const originalOtelEnabled = process.env.OTEL_ENABLED

  beforeEach(() => {
    vi.resetModules()
    preloadOpenTelemetry.mockClear()
  })

  afterEach(() => {
    if (originalOtelEnabled === undefined) {
      delete process.env.OTEL_ENABLED
    } else {
      process.env.OTEL_ENABLED = originalOtelEnabled
    }
  })

  it('preloads Sentry-owned OpenTelemetry only when OTel is enabled', async () => {
    process.env.OTEL_ENABLED = '1'

    await import('./sentry-preload.mts')

    expect(preloadOpenTelemetry).toHaveBeenCalledOnce()
  })

  it('does not preload Sentry-owned OpenTelemetry when OTel is disabled', async () => {
    delete process.env.OTEL_ENABLED

    await import('./sentry-preload.mts')

    expect(preloadOpenTelemetry).not.toHaveBeenCalled()
  })
})
