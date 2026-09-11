import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import { ApiError } from '@/lib/api/error'
import { bootstrapAuthenticatedPushBinding } from '@/lib/push-bootstrap'
import { clearPushBinding } from '@/lib/push-service-worker'

const clearBindingMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const ownershipLockMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/api/client/my'), () => ({
  getMyWebPushSubscriptionsClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/push-bootstrap'), () => ({
  bootstrapAuthenticatedPushBinding: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/push-ownership-lock'), () => ({
  withWebPushOwnershipLock: ownershipLockMock,
}))

vi.mock(import('@/lib/push-service-worker'), () => ({
  clearPushBinding: clearBindingMock,
}))

describe('ServiceWorkerRegistrar authenticated boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearBindingMock.mockResolvedValue({ status: 'disabled', revision: 'cleared-revision' })
    ownershipLockMock.mockImplementation(async (operation: () => Promise<unknown>) => operation())
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register: vi.fn<VitestLooseMock>() },
    })
    Object.defineProperty(window.navigator, 'webdriver', {
      configurable: true,
      value: false,
    })
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: vi.fn<VitestLooseMock>(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears the binding after bootstrap confirms the session is unauthorized', async () => {
    vi.useFakeTimers()
    const registration = { active: {} } as ServiceWorkerRegistration
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)
    vi.mocked(bootstrapAuthenticatedPushBinding).mockRejectedValue(
      new ApiError('Unauthorized', 401),
    )

    render(<ServiceWorkerRegistrar currentUserId='user-1' />)
    await vi.waitFor(() => expect(clearPushBinding).toHaveBeenCalledWith(registration))

    await vi.advanceTimersByTimeAsync(5000)
    expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledOnce()
  })

  it('does not clear after the authenticated effect changes during bootstrap', async () => {
    vi.useFakeTimers()
    const registration = { active: {} } as ServiceWorkerRegistration
    const firstBootstrap = Promise.withResolvers<null>()
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)
    vi.mocked(bootstrapAuthenticatedPushBinding)
      .mockReturnValueOnce(firstBootstrap.promise)
      .mockResolvedValue(null)
    const { rerender } = render(<ServiceWorkerRegistrar currentUserId='user-1' />)
    await vi.waitFor(() => expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledOnce())

    rerender(<ServiceWorkerRegistrar currentUserId='user-2' />)
    await vi.waitFor(() => expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledTimes(2))
    firstBootstrap.reject(new ApiError('Unauthorized', 401))
    await vi.advanceTimersByTimeAsync(5000)

    expect(clearPushBinding).not.toHaveBeenCalled()
    expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledTimes(2)
  })
})
