import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import { MemoryLockManager } from '@/lib/api/client/admission-idempotency-fixtures'
import { clearPushBinding } from '@/lib/push-service-worker'
import { waitForActiveServiceWorker } from '@/lib/service-worker-activation'
import { clearRuntimePublicConfigForTest } from '@/test-helpers/runtime-public-config'
import { useNotificationPushActions } from '../use-notification-push-actions'
import { bootstrapPushBinding } from '../push-registration'

const clearBindingMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const waitForActiveServiceWorkerMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const bootstrapPushBindingMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const initialSubscriptions = [
  {
    id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
    endpoint: 'https://push.example.test/stale-render',
  },
]

vi.mock(import('@/lib/api/client/my'), () => ({
  createMyWebPushSubscription: vi.fn<VitestLooseMock>(),
  deleteMyWebPushSubscription: vi.fn<VitestLooseMock>(),
  getMyWebPushSubscriptionsClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/push-service-worker'), () => ({
  clearPushBinding: clearBindingMock,
}))

vi.mock(import('@/lib/service-worker-activation'), () => ({
  PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS: 5000 as const,
  waitForActiveServiceWorker: waitForActiveServiceWorkerMock,
}))

vi.mock(import('../push-registration'), () => ({
  bootstrapPushBinding: bootstrapPushBindingMock,
  registerAndSavePush: vi.fn<VitestLooseMock>(),
}))

describe('useNotificationPushActions bootstrap authentication boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bootstrapPushBindingMock.mockResolvedValue(null)
    waitForActiveServiceWorkerMock.mockImplementation(async registration => registration)
    clearBindingMock.mockResolvedValue({ status: 'disabled', revision: 'anonymous-revision' })
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: new MemoryLockManager(),
    })
  })

  afterEach(() => {
    clearRuntimePublicConfigForTest()
  })

  it('fenced-clears the worker after settings bootstrap confirms an anonymous session', async () => {
    const registration = { active: {}, pushManager: {} }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    bootstrapPushBindingMock.mockRejectedValueOnce(new ApiError('Unauthorized', 401))

    const cleared = Promise.withResolvers<void>()
    clearBindingMock.mockImplementation(async () => {
      cleared.resolve()
      return { status: 'disabled', revision: 'anonymous-revision' }
    })
    const { result } = renderHook(() => useNotificationPushActions(initialSubscriptions))

    await act(async () => {
      await cleared.promise
      await Promise.resolve()
    })
    expect(clearPushBinding).toHaveBeenCalledWith(registration)
    expect(result.current.pushEnabled).toBe(false)
    expect(bootstrapPushBinding).toHaveBeenCalledOnce()
  })

  it('does not clear after settings bootstrap is cancelled during worker activation', async () => {
    const registration = { active: {}, pushManager: {} }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    bootstrapPushBindingMock.mockRejectedValueOnce(new ApiError('Unauthorized', 401))
    let releaseActivation!: (registration: ServiceWorkerRegistration) => void
    const activationStarted = Promise.withResolvers<void>()
    waitForActiveServiceWorkerMock.mockImplementationOnce(() => {
      activationStarted.resolve()
      return new Promise(resolve => {
        releaseActivation = resolve
      })
    })
    const { rerender } = renderHook(
      ({ subscriptions }) => useNotificationPushActions(subscriptions),
      { initialProps: { subscriptions: initialSubscriptions } },
    )

    await activationStarted.promise
    expect(waitForActiveServiceWorker).toHaveBeenCalledOnce()
    const secondBootstrap = Promise.withResolvers<void>()
    bootstrapPushBindingMock.mockImplementationOnce(async () => {
      secondBootstrap.resolve()
      return null
    })
    rerender({
      subscriptions: [
        ...initialSubscriptions,
        {
          id: '018f95dd-2abd-7c66-9cdd-563a7fa44d90',
          endpoint: 'https://push.example.test/other',
        },
      ],
    })
    releaseActivation(registration as unknown as ServiceWorkerRegistration)
    await act(async () => {
      await secondBootstrap.promise
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(bootstrapPushBinding).toHaveBeenCalledTimes(2)

    expect(clearPushBinding).not.toHaveBeenCalled()
  })
})
