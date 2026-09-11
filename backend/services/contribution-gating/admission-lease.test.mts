import { afterEach, describe, expect, it, vi } from 'vitest'
import { startAdmissionLeaseKeeper } from './admission-lease-keeper.mts'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('admission lease keeper', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renews an active lease while work is in progress', async () => {
    vi.useFakeTimers()
    const renew = vi.fn<() => Promise<boolean>>(async () => true)
    const keeper = startAdmissionLeaseKeeper(renew)

    await expect(keeper.ensureOwned()).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(renew).toHaveBeenCalledTimes(2)
    await expect(keeper.stop()).resolves.toBeUndefined()
  })

  it('fences commit when a renewal no longer owns the lease', async () => {
    vi.useFakeTimers()
    const renew = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const keeper = startAdmissionLeaseKeeper(renew)

    await expect(keeper.ensureOwned()).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)

    await expect(keeper.ensureOwned()).resolves.toBe(false)
    await expect(keeper.stop()).resolves.toBeUndefined()
  })

  it('retries transient renewal failures without forfeiting its claim', async () => {
    const renew = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('write pool temporarily unavailable'))
      .mockResolvedValueOnce(true)
    const keeper = startAdmissionLeaseKeeper(renew)

    await expect(keeper.ensureOwned()).resolves.toBe(true)
    await expect(keeper.ensureOwned()).resolves.toBe(true)

    expect(renew).toHaveBeenCalledTimes(2)
    await expect(keeper.stop()).resolves.toBeUndefined()
  })

  it('stops cleanly after a transient renewal failure', async () => {
    const renew = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('write pool temporarily unavailable'))
    const keeper = startAdmissionLeaseKeeper(renew)

    await expect(keeper.ensureOwned()).resolves.toBe(true)
    await expect(keeper.stop()).resolves.toBeUndefined()
  })

  it('waits for an in-flight renewal before reporting ownership', async () => {
    const pendingRenewal = deferred<boolean>()
    const renew = vi.fn<() => Promise<boolean>>(() => pendingRenewal.promise)
    const keeper = startAdmissionLeaseKeeper(renew)

    const first = keeper.ensureOwned()
    const second = keeper.ensureOwned()
    pendingRenewal.resolve(false)

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    await expect(keeper.stop()).resolves.toBeUndefined()
  })
})
