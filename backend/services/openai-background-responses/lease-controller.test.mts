import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKGROUND_RESPONSE_HEARTBEAT_INTERVAL_MS,
  BACKGROUND_RESPONSE_RENEWAL_RETRY_MS,
  createBackgroundResponseLeaseController,
} from './lease-controller.mts'

describe('background response lease controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serializes renewals and stopAndSettle waits for the in-flight renewal', async () => {
    let releaseRenewal: (() => void) | undefined
    const renewalGate = new Promise<void>(resolve => {
      releaseRenewal = resolve
    })
    const renew = vi.fn<() => Promise<boolean>>(async () => {
      await renewalGate
      return true
    })
    const controller = createBackgroundResponseLeaseController(
      {
        responseId: 'resp_serial',
        leaseToken: '019f0000-0000-7000-8000-000000000001',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      { renew, reportError: vi.fn<(error: Error) => void>() },
    )

    await vi.advanceTimersByTimeAsync(BACKGROUND_RESPONSE_HEARTBEAT_INTERVAL_MS)
    expect(renew).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(BACKGROUND_RESPONSE_HEARTBEAT_INTERVAL_MS * 2)
    expect(renew).toHaveBeenCalledTimes(1)

    let stopped = false
    const stopping = controller.stopAndSettle().then(() => {
      stopped = true
      return undefined
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    releaseRenewal?.()
    await stopping

    await vi.runAllTimersAsync()
    expect(renew).toHaveBeenCalledTimes(1)
  })

  it('does not renew when a queued timer callback runs after stopAndSettle', async () => {
    vi.useRealTimers()
    let queuedCallback: (() => void) | undefined
    const timer = { unref: vi.fn<() => void>() } as unknown as NodeJS.Timeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      callback: Parameters<typeof setTimeout>[0],
    ) => {
      queuedCallback = callback
      return timer
    }) as typeof setTimeout)
    vi.spyOn(globalThis, 'clearTimeout').mockReturnValue(undefined)
    const renew = vi.fn<() => Promise<boolean>>(async () => true)
    const controller = createBackgroundResponseLeaseController(
      {
        responseId: 'resp_queued',
        leaseToken: '019f0000-0000-7000-8000-000000000004',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      { renew, reportError: vi.fn<(error: Error) => void>() },
    )

    await controller.stopAndSettle()
    queuedCallback?.()
    await Promise.resolve()

    expect(renew).not.toHaveBeenCalled()
  })

  it('reports one degraded period and retries thrown renewals every five seconds', async () => {
    const reportError = vi.fn<(error: Error) => void>()
    const renew = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('writer unavailable'))
      .mockRejectedValueOnce(new Error('still unavailable'))
      .mockResolvedValueOnce(true)
    const controller = createBackgroundResponseLeaseController(
      {
        responseId: 'resp_retry',
        leaseToken: '019f0000-0000-7000-8000-000000000002',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      { renew, reportError },
    )

    await vi.advanceTimersByTimeAsync(BACKGROUND_RESPONSE_HEARTBEAT_INTERVAL_MS)
    expect(reportError).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(BACKGROUND_RESPONSE_RENEWAL_RETRY_MS)
    expect(reportError).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(BACKGROUND_RESPONSE_RENEWAL_RETRY_MS)
    expect(renew).toHaveBeenCalledTimes(3)

    await controller.stopAndSettle()
  })

  it('stops permanently when an exact-token renewal loses ownership', async () => {
    const reportError = vi.fn<(error: Error) => void>()
    const renew = vi.fn<() => Promise<boolean>>(async () => false)
    const controller = createBackgroundResponseLeaseController(
      {
        responseId: 'resp_lost',
        leaseToken: '019f0000-0000-7000-8000-000000000003',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      { renew, reportError },
    )

    await vi.advanceTimersByTimeAsync(BACKGROUND_RESPONSE_HEARTBEAT_INTERVAL_MS)
    await vi.runAllTimersAsync()

    expect(renew).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining('lost ownership') }),
    )
    await controller.stopAndSettle()
  })
})
