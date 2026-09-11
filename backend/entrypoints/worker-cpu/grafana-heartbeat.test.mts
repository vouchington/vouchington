import { describe, expect, it, vi } from 'vitest'
import {
  GRAFANA_HEARTBEAT_INTERVAL_MS,
  GRAFANA_HEARTBEAT_TIMEOUT_MS,
  sendGrafanaHeartbeat,
  startGrafanaHeartbeat,
} from './grafana-heartbeat.mts'

const HEARTBEAT_URL =
  'https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/formatted_webhook/token/heartbeat/'
type ExternalFetch = NonNullable<Parameters<typeof sendGrafanaHeartbeat>[1]>

describe('worker-cpu Grafana heartbeat', () => {
  it('posts to the configured Grafana heartbeat endpoint with a bounded timeout', async () => {
    const fetch = vi.fn<ExternalFetch>(async () => new Response(null, { status: 200 }))

    await sendGrafanaHeartbeat(HEARTBEAT_URL, fetch)

    expect(fetch).toHaveBeenCalledWith(
      new URL(HEARTBEAT_URL),
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(GRAFANA_HEARTBEAT_TIMEOUT_MS).toBe(5_000)
  })

  it('rejects non-Grafana and non-HTTPS endpoints without disclosing the URL', async () => {
    await expect(sendGrafanaHeartbeat('https://example.com/secret')).rejects.toThrow(
      'GRAFANA_IRM_HEARTBEAT_URL must be an HTTPS grafana.net endpoint',
    )
    await expect(sendGrafanaHeartbeat('not a secret-safe URL')).rejects.toThrow(
      'GRAFANA_IRM_HEARTBEAT_URL must be an HTTPS grafana.net endpoint',
    )
    await expect(
      sendGrafanaHeartbeat('http://oncall-prod-us-central-0.grafana.net/secret'),
    ).rejects.toThrow('GRAFANA_IRM_HEARTBEAT_URL must be an HTTPS grafana.net endpoint')
  })

  it('fails on a non-success response without including the secret URL', async () => {
    await expect(
      sendGrafanaHeartbeat(HEARTBEAT_URL, async () => new Response(null, { status: 503 })),
    ).rejects.toThrow('Grafana IRM heartbeat returned HTTP 503')
  })

  it('sends immediately, repeats every 60 minutes, reports failures, and stops cleanly', async () => {
    const fetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockRejectedValueOnce(new Error('network unavailable'))
    const onError = vi.fn<(error: Error) => void>()
    const addGracefulShutdownCallback = vi.fn<(callback: () => Promise<void>) => number>(() => 1)
    let scheduled: (() => void) | undefined
    const clearTimeout = vi.fn<typeof globalThis.clearTimeout>()
    const timer = {
      unref: vi.fn<() => ReturnType<typeof globalThis.setTimeout>>(),
    } as unknown as ReturnType<typeof globalThis.setTimeout>
    const setTimeout = vi.fn<
      (callback: () => void, delay: number) => ReturnType<typeof globalThis.setTimeout>
    >((callback, delay) => {
      expect(delay).toBe(GRAFANA_HEARTBEAT_INTERVAL_MS)
      scheduled = callback
      return timer
    })

    const stop = startGrafanaHeartbeat(HEARTBEAT_URL, {
      fetch,
      onError,
      setTimeout,
      clearTimeout,
      addGracefulShutdownCallback,
    })
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(setTimeout).toHaveBeenCalledTimes(1)
    })
    expect(timer.unref).toHaveBeenCalled()
    expect(GRAFANA_HEARTBEAT_INTERVAL_MS).toBe(60 * 60 * 1000)
    expect(addGracefulShutdownCallback).toHaveBeenCalledTimes(1)

    await scheduled?.()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledWith(new Error('network unavailable'))

    stop()
    expect(clearTimeout).toHaveBeenCalledWith(timer)
  })

  it('is disabled when no heartbeat URL is configured', () => {
    const fetch = vi.fn<ExternalFetch>()
    const addGracefulShutdownCallback = vi.fn<(callback: () => Promise<void>) => number>(() => 1)
    const stop = startGrafanaHeartbeat(undefined, {
      fetch,
      onError: vi.fn<(error: Error) => void>(),
      setTimeout:
        vi.fn<(callback: () => void, delay: number) => ReturnType<typeof globalThis.setTimeout>>(),
      clearTimeout: vi.fn<typeof globalThis.clearTimeout>(),
      addGracefulShutdownCallback,
    })

    stop()
    expect(fetch).not.toHaveBeenCalled()
    expect(addGracefulShutdownCallback).not.toHaveBeenCalled()
  })

  it('aborts an in-flight request during graceful shutdown without reporting an error', async () => {
    let requestSignal: AbortSignal | undefined
    const fetch = vi.fn<ExternalFetch>(async (_input, init) => {
      requestSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    })
    const onError = vi.fn<(error: Error) => void>()
    const addGracefulShutdownCallback = vi.fn<(callback: () => Promise<void>) => number>(() => 1)
    const setTimeout =
      vi.fn<(callback: () => void, delay: number) => ReturnType<typeof globalThis.setTimeout>>()

    const stop = startGrafanaHeartbeat(HEARTBEAT_URL, {
      fetch,
      onError,
      setTimeout,
      clearTimeout: vi.fn<typeof globalThis.clearTimeout>(),
      addGracefulShutdownCallback,
    })
    await vi.waitFor(() => expect(requestSignal).toBeDefined())

    stop()

    expect(requestSignal?.aborted).toBe(true)
    await vi.waitFor(() => expect(onError).not.toHaveBeenCalled())
    expect(setTimeout).not.toHaveBeenCalled()
  })
})
