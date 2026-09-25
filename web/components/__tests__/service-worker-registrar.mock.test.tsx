import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import { clearPushBinding } from '@/lib/push-service-worker'
import { bootstrapAuthenticatedPushBinding } from '@/lib/push-bootstrap'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'

const probeMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const clearBindingMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const ownershipLockMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/api/client/my'), () => ({
  getMyWebPushSubscriptionsClient: probeMock,
}))

vi.mock(import('@/lib/push-service-worker'), () => ({
  clearPushBinding: clearBindingMock,
}))

vi.mock(import('@/lib/push-ownership-lock'), () => ({
  withWebPushOwnershipLock: ownershipLockMock,
}))

vi.mock(import('@/lib/push-bootstrap'), () => ({
  bootstrapAuthenticatedPushBinding: vi.fn<VitestLooseMock>(),
}))

describe('ServiceWorkerRegistrar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    probeMock.mockRejectedValue(new ApiError('Unauthorized', 401))
    clearBindingMock.mockResolvedValue({ status: 'disabled', revision: 'anonymous-revision' })
    ownershipLockMock.mockImplementation(async (operation: () => Promise<unknown>) => operation())
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      },
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

  it('registers the public service worker on mount', async () => {
    const registration = {
      active: { postMessage: vi.fn<VitestLooseMock>() },
    } as unknown as ServiceWorkerRegistration
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)
    render(<ServiceWorkerRegistrar />)

    await waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/service-worker.js')
    })
    expect(bootstrapAuthenticatedPushBinding).not.toHaveBeenCalled()
  })

  it('fences an anonymous registration effect after authentication changes', async () => {
    let resolveRegistration!: (registration: ServiceWorkerRegistration) => void
    const registration = { active: {} } as ServiceWorkerRegistration
    vi.mocked(bootstrapAuthenticatedPushBinding).mockResolvedValue(null)
    vi.mocked(navigator.serviceWorker.register).mockReturnValue(
      new Promise(resolve => {
        resolveRegistration = resolve
      }),
    )
    const { rerender } = render(<ServiceWorkerRegistrar />)
    rerender(<ServiceWorkerRegistrar currentUserId='user-1' />)
    resolveRegistration(registration)

    await waitFor(() =>
      expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledWith(registration),
    )
  })

  it('clears only after the auth probe confirms a genuine anonymous boundary', async () => {
    const registration = { active: {} } as ServiceWorkerRegistration
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)

    render(<ServiceWorkerRegistrar />)

    await waitFor(() => expect(clearPushBinding).toHaveBeenCalledWith(registration))
    expect(probeMock).toHaveBeenCalledWith({ limit: 1 })
    expect(ownershipLockMock).toHaveBeenCalledOnce()
  })

  it('preserves the binding when the auth probe succeeds', async () => {
    const registration = { active: {} } as ServiceWorkerRegistration
    probeMock.mockResolvedValue({ results: [], page_info: {} })
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)

    render(<ServiceWorkerRegistrar />)

    await waitFor(() => expect(probeMock).toHaveBeenCalledWith({ limit: 1 }))
    expect(clearPushBinding).not.toHaveBeenCalled()
  })

  it('retries a transient anonymous probe on the bounded timer', async () => {
    vi.useFakeTimers()
    const registration = { active: {} } as ServiceWorkerRegistration
    probeMock.mockRejectedValueOnce(new ApiError('Unavailable', 503))
    probeMock.mockRejectedValueOnce(new ApiError('Unauthorized', 401))
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)

    render(<ServiceWorkerRegistrar />)
    await vi.waitFor(() => expect(probeMock).toHaveBeenCalledOnce())
    expect(clearPushBinding).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)
    await vi.waitFor(() => expect(clearPushBinding).toHaveBeenCalledWith(registration))
    expect(probeMock).toHaveBeenCalledTimes(2)
  })

  it('does not mutate the worker for a non-authentication probe error', async () => {
    const registration = { active: {} } as ServiceWorkerRegistration
    probeMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)

    const { unmount } = render(<ServiceWorkerRegistrar />)
    await waitFor(() => expect(probeMock).toHaveBeenCalledOnce())

    expect(clearPushBinding).not.toHaveBeenCalled()
    unmount()
  })

  it('retries a transient anonymous probe when the browser comes online', async () => {
    const registration = { active: {} } as ServiceWorkerRegistration
    probeMock.mockRejectedValueOnce(new ApiError('Unavailable', 503))
    probeMock.mockRejectedValueOnce(new ApiError('Unauthorized', 401))
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)

    render(<ServiceWorkerRegistrar />)
    await waitFor(() => expect(probeMock).toHaveBeenCalledOnce())
    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(clearPushBinding).toHaveBeenCalledWith(registration))
    expect(probeMock).toHaveBeenCalledTimes(2)
  })

  it('reconciles an offline fallback once the browser comes online', async () => {
    const registration = { active: {} } as ServiceWorkerRegistration
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    document.head.innerHTML = '<meta name="voucha-offline-fallback" content="true">'

    render(<ServiceWorkerRegistrar />)
    await Promise.resolve()
    expect(probeMock).not.toHaveBeenCalled()
    expect(clearPushBinding).not.toHaveBeenCalled()

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(probeMock).toHaveBeenCalledWith({ limit: 1 }))
    expect(clearPushBinding).toHaveBeenCalledWith(registration)
  })

  it('retries a transient authenticated bootstrap on the bounded timer', async () => {
    vi.useFakeTimers()
    const registration = { active: {} } as ServiceWorkerRegistration
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)
    vi.mocked(bootstrapAuthenticatedPushBinding)
      .mockRejectedValueOnce(new ApiError('Unavailable', 503))
      .mockResolvedValueOnce(null)

    render(<ServiceWorkerRegistrar currentUserId='user-1' />)
    await vi.waitFor(() => expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledOnce())

    await vi.advanceTimersByTimeAsync(5000)
    await vi.waitFor(() => expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledTimes(2))
  })

  it('does not clear after authentication changes during the anonymous probe', async () => {
    let rejectProbe!: (error: Error) => void
    const registration = { active: {} } as ServiceWorkerRegistration
    probeMock.mockReturnValueOnce(new Promise((_, reject) => (rejectProbe = reject)))
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)
    const { rerender } = render(<ServiceWorkerRegistrar />)

    await waitFor(() => expect(probeMock).toHaveBeenCalledOnce())
    rerender(<ServiceWorkerRegistrar currentUserId='user-1' />)
    rejectProbe(new ApiError('Unauthorized', 401))
    await waitFor(() => expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledOnce())

    expect(clearPushBinding).not.toHaveBeenCalled()
  })

  it('cancels anonymous timer and online retries after authentication changes', async () => {
    vi.useFakeTimers()
    const registration = { active: {} } as ServiceWorkerRegistration
    probeMock.mockRejectedValue(new ApiError('Unavailable', 503))
    vi.mocked(navigator.serviceWorker.register).mockResolvedValue(registration)
    const { rerender } = render(<ServiceWorkerRegistrar />)

    await vi.waitFor(() => expect(probeMock).toHaveBeenCalledOnce())
    rerender(<ServiceWorkerRegistrar currentUserId='user-1' />)
    await vi.waitFor(() => expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledOnce())
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(5000)

    expect(probeMock).toHaveBeenCalledOnce()
    expect(clearPushBinding).not.toHaveBeenCalled()
  })

  it.each(['installing', 'waiting'] as const)(
    'waits for a %s replacement service worker to activate before bootstrapping',
    async phase => {
      const replacement = makeWorker()
      const registration = {
        active: {} as ServiceWorker,
        installing: phase === 'installing' ? replacement.worker : null,
        waiting: phase === 'waiting' ? replacement.worker : null,
      } as unknown as ServiceWorkerRegistration
      Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value: {
          register: vi.fn<VitestLooseMock>().mockResolvedValue(registration),
        },
      })
      vi.mocked(bootstrapAuthenticatedPushBinding).mockResolvedValue(null)

      render(<ServiceWorkerRegistrar currentUserId='user-1' />)
      await waitFor(() => expect(navigator.serviceWorker.register).toHaveBeenCalledOnce())
      expect(bootstrapAuthenticatedPushBinding).not.toHaveBeenCalled()

      replacement.setState('activated')
      await waitFor(() =>
        expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledWith(registration),
      )
    },
  )

  it('does not register in automated browsers', () => {
    Object.defineProperty(window.navigator, 'webdriver', {
      configurable: true,
      value: true,
    })

    render(<ServiceWorkerRegistrar />)

    expect(navigator.serviceWorker.register).not.toHaveBeenCalled()
  })

  it('bootstraps an authenticated user once after registration', async () => {
    const registration = {
      active: { postMessage: vi.fn<VitestLooseMock>() },
    } as unknown as ServiceWorkerRegistration
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register: vi.fn<VitestLooseMock>().mockResolvedValue(registration) },
    })
    vi.mocked(bootstrapAuthenticatedPushBinding).mockResolvedValue(null)

    const { rerender } = render(<ServiceWorkerRegistrar currentUserId='user-1' />)
    rerender(<ServiceWorkerRegistrar currentUserId='user-1' />)

    await waitFor(() => {
      expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledWith(registration)
    })
    expect(bootstrapAuthenticatedPushBinding).toHaveBeenCalledOnce()
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
