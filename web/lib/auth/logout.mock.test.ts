import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { postLogout } from '@/lib/api/client'
import { admissionIdempotency } from '@/lib/api/client/admission-idempotency'
import { MemoryLockManager } from '@/lib/api/client/admission-idempotency-test-helpers'
import { withWebPushOwnershipLock } from '@/lib/push-ownership-lock'
import { clearPushBinding } from '@/lib/push-service-worker'
import { waitForActiveServiceWorker } from '@/lib/service-worker-activation'
import { logout } from './logout'

const mockAdmissionDrain = vi.spyOn(admissionIdempotency, 'drain').mockResolvedValue(true)
const mockAdmissionPause = vi.spyOn(admissionIdempotency, 'pause').mockImplementation(() => {})
const mockAdmissionResume = vi.spyOn(admissionIdempotency, 'resume').mockImplementation(() => {})

vi.mock(import('@/lib/api/client'), () => ({
  postLogout: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/push-service-worker'), () => ({
  clearPushBinding: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/service-worker-activation'), () => ({
  PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS: 5000 as const,
  waitForActiveServiceWorker: vi.fn<VitestLooseMock>(),
}))

const mockPostLogout = vi.mocked(postLogout)
const mockClearPushBinding = vi.mocked(clearPushBinding)

describe('logout', () => {
  beforeEach(() => {
    mockPostLogout.mockResolvedValue(undefined)
    mockClearPushBinding.mockResolvedValue({ status: 'disabled', revision: 'logout-revision' })
    vi.mocked(waitForActiveServiceWorker).mockImplementation(async registration => registration)
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: new MemoryLockManager(),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('clears the service-worker binding before submitting the exact logout binding', async () => {
    const registration = {
      active: {},
      pushManager: { getSubscription: vi.fn<VitestLooseMock>().mockResolvedValue(null) },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    mockClearPushBinding.mockResolvedValueOnce({
      status: 'disabled',
      revision: 'logout-binding-revision',
      binding: {
        endpoint: 'https://push.example.test/subscription',
        subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
      },
    })

    await logout(vi.fn<VitestLooseMock>())

    expect(mockClearPushBinding).toHaveBeenCalledWith(registration)
    expect(mockPostLogout).toHaveBeenCalledWith({
      web_push_endpoint: 'https://push.example.test/subscription',
      web_push_subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
    })
    expect(mockClearPushBinding.mock.invocationCallOrder[0]).toBeLessThan(
      mockPostLogout.mock.invocationCallOrder[0] ?? Infinity,
    )
  })

  it('waits for admissions to drain before logging out', async () => {
    let releaseDrain!: () => void
    mockAdmissionDrain.mockImplementationOnce(
      () => new Promise<true>(resolve => (releaseDrain = () => resolve(true))),
    )
    const reloadPage = vi.fn<VitestLooseMock>()

    const loggedOut = logout(reloadPage)

    expect(mockAdmissionPause).toHaveBeenCalledOnce()
    expect(mockAdmissionDrain).toHaveBeenCalledOnce()
    expect(mockPostLogout).not.toHaveBeenCalled()

    releaseDrain()
    await loggedOut

    expect(mockAdmissionDrain.mock.invocationCallOrder[0]).toBeLessThan(
      mockPostLogout.mock.invocationCallOrder[0] ?? Infinity,
    )
    expect(mockPostLogout).toHaveBeenCalledOnce()
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('continues logout after a bounded drain while retaining the retry key', async () => {
    const reloadPage = vi.fn<VitestLooseMock>()
    mockAdmissionDrain.mockResolvedValueOnce(false)

    await logout(reloadPage)

    expect(mockAdmissionResume).not.toHaveBeenCalled()
    expect(mockPostLogout).toHaveBeenCalledOnce()
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('logs out without push cleanup when the Web Locks API is unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    const reloadPage = vi.fn<VitestLooseMock>()

    await logout(reloadPage)

    expect(mockClearPushBinding).not.toHaveBeenCalled()
    expect(mockPostLogout).toHaveBeenCalledWith()
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('throws and does not reload when logout fails', async () => {
    const error = new Error('logout failed')
    const reloadPage = vi.fn<VitestLooseMock>()
    mockPostLogout.mockRejectedValue(error)

    await expect(logout(reloadPage)).rejects.toBe(error)
    expect(mockAdmissionResume).toHaveBeenCalledOnce()
    expect(reloadPage).not.toHaveBeenCalled()
  })

  it('does not resume submissions after logout succeeds when reload fails', async () => {
    const error = new Error('reload failed')
    const reloadPage = vi.fn<() => void>(() => {
      throw error
    })

    await expect(logout(reloadPage)).rejects.toBe(error)

    expect(mockPostLogout).toHaveBeenCalledOnce()
    expect(mockAdmissionResume).not.toHaveBeenCalled()
  })

  it('holds the ownership lock through server logout and physical unsubscribe', async () => {
    const events: string[] = []
    const unsubscribe = vi.fn<() => Promise<boolean>>(async () => {
      events.push('unsubscribe')
      return true
    })
    const registration = {
      active: {},
      pushManager: { getSubscription: vi.fn<VitestLooseMock>().mockResolvedValue({ unsubscribe }) },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    let releaseLogout!: () => void
    mockPostLogout.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          releaseLogout = () => {
            events.push('logout')
            resolve()
          }
        }),
    )

    const loggingOut = logout(vi.fn<VitestLooseMock>())
    await vi.waitFor(() => expect(mockPostLogout).toHaveBeenCalledOnce())
    const concurrent = withWebPushOwnershipLock(async () => {
      events.push('concurrent')
    })
    await Promise.resolve()
    expect(events).toEqual([])

    releaseLogout()
    await loggingOut
    await concurrent
    expect(events).toEqual(['logout', 'unsubscribe', 'concurrent'])
  })

  it('waits for a replacement worker before clearing its binding', async () => {
    const registration = {
      active: {},
      pushManager: { getSubscription: vi.fn<VitestLooseMock>().mockResolvedValue(null) },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    let releaseActivation!: (registration: ServiceWorkerRegistration) => void
    vi.mocked(waitForActiveServiceWorker).mockImplementationOnce(
      () => new Promise(resolve => (releaseActivation = resolve)),
    )
    const loggingOut = logout(vi.fn<VitestLooseMock>())
    await vi.waitFor(() =>
      expect(waitForActiveServiceWorker).toHaveBeenCalledWith(registration, { timeoutMs: 5000 }),
    )
    expect(mockClearPushBinding).not.toHaveBeenCalled()

    releaseActivation(registration as unknown as ServiceWorkerRegistration)
    await loggingOut
    expect(mockClearPushBinding).toHaveBeenCalledWith(registration)
  })

  it('posts logout when the bounded worker activation wait expires', async () => {
    const unsubscribe = vi.fn<VitestLooseMock>().mockResolvedValue(true)
    const registration = {
      active: {},
      pushManager: { getSubscription: vi.fn<VitestLooseMock>().mockResolvedValue({ unsubscribe }) },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    vi.mocked(waitForActiveServiceWorker).mockRejectedValueOnce(new Error('activation timed out'))
    const reloadPage = vi.fn<VitestLooseMock>()

    await logout(reloadPage)

    expect(waitForActiveServiceWorker).toHaveBeenCalledWith(registration, { timeoutMs: 5000 })
    expect(mockClearPushBinding).not.toHaveBeenCalled()
    expect(mockPostLogout).toHaveBeenCalledWith()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('still posts logout when worker activation fails', async () => {
    const unsubscribe = vi.fn<VitestLooseMock>().mockResolvedValue(true)
    const registration = {
      active: {},
      pushManager: { getSubscription: vi.fn<VitestLooseMock>().mockResolvedValue({ unsubscribe }) },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    vi.mocked(waitForActiveServiceWorker).mockRejectedValueOnce(new Error('activation failed'))
    const reloadPage = vi.fn<VitestLooseMock>()

    await logout(reloadPage)

    expect(mockClearPushBinding).not.toHaveBeenCalled()
    expect(mockPostLogout).toHaveBeenCalledWith()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('still posts logout without a binding when worker cleanup fails', async () => {
    const registration = { active: {} }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    mockClearPushBinding.mockRejectedValueOnce(new Error('worker unavailable'))
    const reloadPage = vi.fn<VitestLooseMock>()

    await logout(reloadPage)

    expect(mockPostLogout).toHaveBeenCalledWith()
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('finishes logout when the registered worker has no PushManager', async () => {
    const registration = { active: {} }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    const reloadPage = vi.fn<VitestLooseMock>()

    await logout(reloadPage)

    expect(mockPostLogout).toHaveBeenCalledOnce()
    expect(reloadPage).toHaveBeenCalledOnce()
  })
})
