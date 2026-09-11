import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ServiceWorkerActivationTimeoutError,
  waitForActiveServiceWorker,
} from './service-worker-activation'

describe('waitForActiveServiceWorker', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(['installing', 'waiting'] as const)(
    'waits for a %s replacement worker to activate',
    async phase => {
      const replacement = makeWorker()
      const registration = {
        active: {} as ServiceWorker,
        installing: phase === 'installing' ? replacement.worker : null,
        waiting: phase === 'waiting' ? replacement.worker : null,
      } as unknown as ServiceWorkerRegistration

      const ready = waitForActiveServiceWorker(registration)
      replacement.setState('activated')

      await expect(ready).resolves.toBe(registration)
    },
  )

  it('fails closed when a replacement worker becomes redundant', async () => {
    const replacement = makeWorker()
    const registration = {
      active: {} as ServiceWorker,
      installing: replacement.worker,
      waiting: null,
    } as unknown as ServiceWorkerRegistration

    const ready = waitForActiveServiceWorker(registration)
    replacement.setState('redundant')

    await expect(ready).rejects.toThrow('became redundant')
  })

  it('times out and removes its listener when a replacement stalls', async () => {
    vi.useFakeTimers()
    const replacement = makeWorker()
    const removeEventListener = vi.spyOn(replacement.worker, 'removeEventListener')
    const registration = {
      active: {} as ServiceWorker,
      installing: replacement.worker,
      waiting: null,
    } as unknown as ServiceWorkerRegistration
    const ready = waitForActiveServiceWorker(registration, { timeoutMs: 5000 })
    const rejection = ready.catch(error => error)

    await vi.advanceTimersByTimeAsync(5000)

    await expect(rejection).resolves.toBeInstanceOf(ServiceWorkerActivationTimeoutError)
    expect(removeEventListener).toHaveBeenCalledWith('statechange', expect.any(Function))
  })

  it('times out while navigator readiness has no active worker', async () => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: new Promise<ServiceWorkerRegistration>(() => {}) },
    })
    const registration = {
      active: null,
      installing: null,
      waiting: null,
    } as unknown as ServiceWorkerRegistration
    const ready = waitForActiveServiceWorker(registration, { timeoutMs: 5000 })
    const rejection = ready.catch(error => error)

    await vi.advanceTimersByTimeAsync(5000)

    await expect(rejection).resolves.toBeInstanceOf(ServiceWorkerActivationTimeoutError)
  })

  it('keeps the default replacement wait unbounded', async () => {
    vi.useFakeTimers()
    const replacement = makeWorker()
    const registration = {
      active: {} as ServiceWorker,
      installing: replacement.worker,
      waiting: null,
    } as unknown as ServiceWorkerRegistration
    const ready = waitForActiveServiceWorker(registration)
    let settled = false
    void ready.finally(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(5000)
    expect(settled).toBe(false)
    replacement.setState('activated')
    await expect(ready).resolves.toBe(registration)
  })
})

function makeWorker(state: ServiceWorker['state'] = 'installing') {
  const worker = new EventTarget() as ServiceWorker
  Object.defineProperty(worker, 'state', { configurable: true, value: state })
  return {
    worker,
    setState(nextState: ServiceWorker['state']) {
      Object.defineProperty(worker, 'state', { configurable: true, value: nextState })
      worker.dispatchEvent(new Event('statechange'))
    },
  }
}
