import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationPushActions } from './use-notification-push-actions'
import { bootstrapPushBinding } from './push-registration'
import { MemoryLockManager } from '@/lib/api/client/admission-idempotency-test-helpers'
import { withWebPushOwnershipLock } from '@/lib/push-ownership-lock'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

const toastErrorMock = vi.hoisted(() => vi.fn<(message: string) => void>())
const deletePushMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const clearBindingMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const waitForActiveServiceWorkerMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const initialSubscriptions = [
  {
    id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
    endpoint: 'https://push.example.test/stale-render',
  },
]
type SonnerModule = typeof import('sonner')

vi.mock(import('sonner'), async importOriginal => {
  const actual = await importOriginal<SonnerModule>()
  return {
    ...actual,
    toast: Object.assign(vi.fn<VitestLooseMock>(), actual.toast, {
      error: toastErrorMock,
    }),
  }
})

vi.mock(import('@/lib/api/client/my'), () => ({
  createMyWebPushSubscription: vi.fn<VitestLooseMock>(),
  deleteMyWebPushSubscription: deletePushMock,
  getMyWebPushSubscriptionsClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/push-service-worker'), () => ({
  clearPushBinding: clearBindingMock,
}))

vi.mock(import('@/lib/service-worker-activation'), () => ({
  PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS: 5000 as const,
  waitForActiveServiceWorker: waitForActiveServiceWorkerMock,
}))

vi.mock(import('./push-registration'), () => ({
  bootstrapPushBinding: vi.fn<VitestLooseMock>().mockResolvedValue(null),
  registerAndSavePush: vi.fn<VitestLooseMock>(),
}))

describe('useNotificationPushActions', () => {
  beforeEach(() => {
    toastErrorMock.mockClear()
    deletePushMock.mockReset()
    clearBindingMock.mockReset()
    waitForActiveServiceWorkerMock.mockImplementation(async registration => registration)
    vi.mocked(bootstrapPushBinding).mockReset().mockResolvedValue(null)
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: new MemoryLockManager(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    clearRuntimePublicConfigForTest()
  })

  it('preserves a known binding while a changed subscription list fails to bootstrap', async () => {
    const binding = {
      endpoint: initialSubscriptions[0]!.endpoint,
      subscription_id: initialSubscriptions[0]!.id,
    }
    vi.mocked(bootstrapPushBinding).mockResolvedValueOnce(binding)
    const { result, rerender } = renderHook(
      ({ subscriptions }) => useNotificationPushActions(subscriptions),
      { initialProps: { subscriptions: initialSubscriptions } },
    )
    await vi.waitFor(() => expect(result.current.pushEnabled).toBe(true))
    vi.mocked(bootstrapPushBinding).mockRejectedValueOnce(new Error('offline'))

    rerender({
      subscriptions: [
        ...initialSubscriptions,
        {
          id: '018f95dd-2abd-7c66-9cdd-563a7fa44d90',
          endpoint: 'https://push.example.test/other',
        },
      ],
    })
    await vi.waitFor(() => expect(bootstrapPushBinding).toHaveBeenCalledTimes(2))

    expect(result.current.pushEnabled).toBe(true)
    expect(result.current.currentSubscriptionId).toBe(initialSubscriptions[0]!.id)
  })

  it('retries a transient bootstrap and publishes the recovered binding', async () => {
    vi.useFakeTimers()
    const binding = {
      endpoint: initialSubscriptions[0]!.endpoint,
      subscription_id: initialSubscriptions[0]!.id,
    }
    vi.mocked(bootstrapPushBinding)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(binding)
    const { result } = renderHook(() => useNotificationPushActions(initialSubscriptions))
    await vi.waitFor(() => expect(bootstrapPushBinding).toHaveBeenCalledOnce())

    await vi.advanceTimersByTimeAsync(5000)
    await vi.waitFor(() =>
      expect(result.current.currentSubscriptionId).toBe(binding.subscription_id),
    )

    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(bootstrapPushBinding).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending bootstrap retry on unmount', async () => {
    vi.useFakeTimers()
    vi.mocked(bootstrapPushBinding).mockRejectedValue(new Error('offline'))
    const { unmount } = renderHook(() => useNotificationPushActions(initialSubscriptions))
    await vi.waitFor(() => expect(bootstrapPushBinding).toHaveBeenCalledOnce())

    unmount()
    await vi.advanceTimersByTimeAsync(5000)

    expect(bootstrapPushBinding).toHaveBeenCalledOnce()
  })

  it('requires the runtime public web push key before enabling push', async () => {
    setRuntimePublicConfigForTest({})

    const { result } = renderHook(() => useNotificationPushActions([]))

    await act(() => result.current.handleEnablePush())

    expect(toastErrorMock).toHaveBeenCalledWith('Web push is not configured.')
  })

  it('uses the runtime public web push key before checking browser support', async () => {
    setRuntimePublicConfigForTest({ webPushPublicKey: 'runtime-push-key' })

    const { result } = renderHook(() => useNotificationPushActions([]))

    await act(() => result.current.handleEnablePush())

    expect(toastErrorMock).toHaveBeenCalledWith('This browser does not support push notifications.')
  })

  it('does not request permission when ownership locks are unavailable', async () => {
    setRuntimePublicConfigForTest({ webPushPublicKey: 'runtime-push-key' })
    const requestPermission = vi.fn<VitestLooseMock>().mockResolvedValue('granted')
    const register = vi.fn<VitestLooseMock>()
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission },
    })
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: vi.fn<VitestLooseMock>(),
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    const { result } = renderHook(() => useNotificationPushActions([]))

    await act(() => result.current.handleEnablePush())

    expect(requestPermission).not.toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
    expect(result.current.pushStatus).toBe('idle')
    expect(toastErrorMock).toHaveBeenCalledWith('This browser does not support push notifications.')
  })

  it('deletes the generation returned by the authoritative clear acknowledgement', async () => {
    const unsubscribe = vi.fn<VitestLooseMock>().mockResolvedValue(true)
    const registration = {
      active: {},
      pushManager: {
        getSubscription: vi
          .fn<VitestLooseMock>()
          .mockResolvedValue({ endpoint: 'https://push.example.test/current', unsubscribe }),
      },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    clearBindingMock.mockResolvedValue({
      status: 'disabled',
      revision: 'disable-revision',
      binding: {
        endpoint: 'https://push.example.test/current',
        subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d80',
      },
    })
    deletePushMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useNotificationPushActions(initialSubscriptions))

    await act(() => result.current.handleDisablePush())

    expect(deletePushMock).toHaveBeenCalledWith('018f95dd-2abd-7c66-9cdd-563a7fa44d80')
    expect(waitForActiveServiceWorkerMock).toHaveBeenCalledWith(registration, { timeoutMs: 5000 })
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('commits disabled UI state when physical unsubscribe fails after deletion', async () => {
    const unsubscribe = vi.fn<VitestLooseMock>().mockRejectedValue(new Error('offline'))
    const registration = {
      active: {},
      pushManager: {
        getSubscription: vi.fn<VitestLooseMock>().mockResolvedValue({ unsubscribe }),
      },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    clearBindingMock.mockResolvedValue({
      status: 'disabled',
      revision: 'disable-revision',
      binding: {
        endpoint: 'https://push.example.test/current',
        subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d80',
      },
    })
    deletePushMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useNotificationPushActions([]))

    await act(() => result.current.handleDisablePush())

    expect(deletePushMock).toHaveBeenCalledWith('018f95dd-2abd-7c66-9cdd-563a7fa44d80')
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(result.current.pushEnabled).toBe(false)
  })

  it('keeps a concurrent ownership change behind deletion and physical unsubscribe', async () => {
    const events: string[] = []
    const unsubscribe = vi.fn<() => Promise<boolean>>(async () => {
      events.push('unsubscribe')
      return true
    })
    const registration = {
      active: {},
      pushManager: {
        getSubscription: vi.fn<VitestLooseMock>().mockResolvedValue({ unsubscribe }),
      },
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    clearBindingMock.mockResolvedValue({
      status: 'disabled',
      revision: 'disable-race-revision',
      binding: {
        endpoint: 'https://push.example.test/current',
        subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d80',
      },
    })
    let releaseDelete!: () => void
    deletePushMock.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          releaseDelete = () => {
            events.push('delete')
            resolve()
          }
        }),
    )
    const { result } = renderHook(() => useNotificationPushActions(initialSubscriptions))

    let disable!: Promise<void>
    act(() => {
      disable = result.current.handleDisablePush()
    })
    await vi.waitFor(() => expect(deletePushMock).toHaveBeenCalledOnce())
    const concurrent = withWebPushOwnershipLock(async () => {
      events.push('concurrent')
    })
    await Promise.resolve()
    expect(events).toEqual([])

    releaseDelete()
    await act(async () => disable)
    await concurrent
    expect(events).toEqual(['delete', 'unsubscribe', 'concurrent'])
  })
})
