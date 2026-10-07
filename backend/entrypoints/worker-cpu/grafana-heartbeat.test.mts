import { afterEach, describe, expect, it, vi } from 'vitest'
import { startGrafanaHeartbeat } from './grafana-heartbeat.mts'
import { sendGrafanaHeartbeat } from './grafana-heartbeat-request.mts'

const HEARTBEAT_URL =
  'https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/formatted_webhook/token/heartbeat/'
type ExternalFetch = NonNullable<Parameters<typeof sendGrafanaHeartbeat>[1]>

describe('worker-cpu Grafana heartbeat', () => {
  afterEach(() => vi.restoreAllMocks())
  it('posts to the configured Grafana heartbeat endpoint with a bounded timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
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
    expect(timeout).toHaveBeenCalledExactlyOnceWith(5_000)
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
    const firstScheduled = Promise.withResolvers<void>()
    let scheduled: (() => Promise<void>) | undefined
    const clearTimeout = vi.fn<typeof globalThis.clearTimeout>()
    const timer = {
      unref: vi.fn<() => ReturnType<typeof globalThis.setTimeout>>(),
    } as unknown as ReturnType<typeof globalThis.setTimeout>
    const setTimeout = vi.fn<
      (callback: () => Promise<void>, delay: number) => ReturnType<typeof globalThis.setTimeout>
    >((callback, delay) => {
      expect(delay).toBe(60 * 60 * 1000)
      scheduled = callback
      if (setTimeout.mock.calls.length === 1) firstScheduled.resolve()
      return timer
    })

    const stop = startGrafanaHeartbeat(HEARTBEAT_URL, {
      fetch,
      onError,
      setTimeout,
      clearTimeout,
      addGracefulShutdownCallback,
    })
    await firstScheduled.promise
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(setTimeout).toHaveBeenCalledTimes(1)
    expect(timer.unref).toHaveBeenCalled()
    expect(addGracefulShutdownCallback).toHaveBeenCalledTimes(1)

    if (!scheduled) throw new Error('Heartbeat must schedule its next run')
    await scheduled()
    expect(setTimeout).toHaveBeenCalledTimes(2)
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
        vi.fn<
          (callback: () => Promise<void>, delay: number) => ReturnType<typeof globalThis.setTimeout>
        >(),
      clearTimeout: vi.fn<typeof globalThis.clearTimeout>(),
      addGracefulShutdownCallback,
    })

    stop()
    expect(fetch).not.toHaveBeenCalled()
    expect(addGracefulShutdownCallback).not.toHaveBeenCalled()
  })

  it('aborts an in-flight request during graceful shutdown without reporting an error', async () => {
    const scheduled = Promise.withResolvers<() => Promise<void>>()
    const requestStarted = Promise.withResolvers<AbortSignal>()
    const fetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockImplementationOnce(async (_input, init) => {
        const signal = init?.signal
        if (!signal) throw new Error('Heartbeat request must include an abort signal')
        requestStarted.resolve(signal)
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      })
    const onError = vi.fn<(error: Error) => void>()
    const timer = { unref: vi.fn<() => void>() } as unknown as ReturnType<
      typeof globalThis.setTimeout
    >
    const setTimeout = vi.fn<
      (callback: () => Promise<void>, delay: number) => ReturnType<typeof globalThis.setTimeout>
    >(callback => {
      scheduled.resolve(callback)
      return timer
    })

    const stop = startGrafanaHeartbeat(HEARTBEAT_URL, {
      fetch,
      onError,
      setTimeout,
      clearTimeout: vi.fn<typeof globalThis.clearTimeout>(),
      addGracefulShutdownCallback: vi.fn<(callback: () => Promise<void>) => number>(() => 1),
    })
    const runHeartbeat = await scheduled.promise
    // The registered timer callback returns the async heartbeat's completion promise.
    const request = runHeartbeat()
    const signal = await requestStarted.promise
    stop()
    expect(signal.aborted).toBe(true)
    await request
    expect(onError).not.toHaveBeenCalled()
    expect(setTimeout).toHaveBeenCalledOnce()
  })
})
