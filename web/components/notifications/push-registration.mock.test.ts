import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMyWebPushSubscription, deleteMyWebPushSubscription } from '@/lib/api/client/my'
import { MemoryLockManager } from '@/lib/api/client/admission-idempotency-test-helpers'
import { bindPushBinding, clearPushBinding } from '@/lib/push-service-worker'
import { waitForActiveServiceWorker } from '@/lib/service-worker-activation'
import { bootstrapPushBinding, registerAndSavePush } from './push-registration'

const bootstrapBindingMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/push-bootstrap'), () => ({
  bootstrapAuthenticatedPushBinding: bootstrapBindingMock,
}))

vi.mock(import('@/lib/api/client/my'), () => ({
  createMyWebPushSubscription: vi.fn<VitestLooseMock>(),
  deleteMyWebPushSubscription: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/push-service-worker'), () => ({
  bindPushBinding: vi.fn<VitestLooseMock>(),
  clearPushBinding: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/service-worker-activation'), () => ({
  PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS: 5000 as const,
  waitForActiveServiceWorker: vi.fn<VitestLooseMock>(),
}))

const endpoint = 'https://push.example.test/current'
const subscriptionId = '018f95dd-2abd-7c66-9cdd-563a7fa44d8f'
const revision = 'registration-revision'
const physicalSubscription = {
  toJSON: vi.fn<VitestLooseMock>().mockReturnValue({
    endpoint,
    expirationTime: null,
    keys: { p256dh: 'p256dh-secret', auth: 'auth-secret' },
  }),
  unsubscribe: vi.fn<VitestLooseMock>(),
}
const getSubscription = vi.fn<VitestLooseMock>().mockResolvedValue(physicalSubscription)
const registration = { active: {}, pushManager: { getSubscription } }

describe('push registration ownership handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(waitForActiveServiceWorker).mockImplementation(async registration => registration)
    bootstrapBindingMock.mockResolvedValue(null)
    getSubscription.mockResolvedValue(physicalSubscription)
    vi.mocked(clearPushBinding).mockResolvedValue({ status: 'disabled', revision })
    vi.mocked(createMyWebPushSubscription).mockResolvedValue({
      web_push_subscription: {
        __entity_type: 'web_push_subscription',
        id: subscriptionId,
        user_id: '00000000-0000-7000-8000-000000000001',
        endpoint,
        p256dh: 'p256dh-secret',
        auth: 'auth-secret',
        expiration_time_ms: null,
        user_agent: 'vitest',
        last_success_at: null,
        last_failure_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    })
    vi.mocked(bindPushBinding).mockResolvedValue({
      status: 'bound',
      binding: { endpoint, subscription_id: subscriptionId },
      revision,
    })
    vi.mocked(deleteMyWebPushSubscription).mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: new MemoryLockManager(),
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn<VitestLooseMock>().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
    })
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: vi.fn<VitestLooseMock>(),
    })
  })

  it('clears, reuses the physical subscription, saves a fresh generation, then binds it', async () => {
    await expect(registerAndSavePush('unused-for-existing-subscription')).resolves.toEqual({
      id: subscriptionId,
      endpoint,
    })

    expect(vi.mocked(clearPushBinding).mock.invocationCallOrder[0]).toBeLessThan(
      getSubscription.mock.invocationCallOrder[0]!,
    )
    expect(getSubscription.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createMyWebPushSubscription).mock.invocationCallOrder[0]!,
    )
    expect(vi.mocked(createMyWebPushSubscription).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(bindPushBinding).mock.invocationCallOrder[0]!,
    )
    expect(bindPushBinding).toHaveBeenCalledWith(
      registration,
      { endpoint, subscription_id: subscriptionId },
      revision,
    )
  })

  it('exact-deletes the fresh generation when the worker refuses its binding', async () => {
    const bindError = new Error('binding rejected')
    vi.mocked(bindPushBinding).mockRejectedValue(bindError)

    await expect(registerAndSavePush('unused-for-existing-subscription')).rejects.toBe(bindError)

    expect(deleteMyWebPushSubscription).toHaveBeenCalledWith(subscriptionId)
    expect(vi.mocked(bindPushBinding).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteMyWebPushSubscription).mock.invocationCallOrder[0]!,
    )
  })

  it('waits for worker activation before explicit enable sends protocol messages', async () => {
    let releaseActivation!: (registration: ServiceWorkerRegistration) => void
    vi.mocked(waitForActiveServiceWorker).mockImplementationOnce(
      () => new Promise(resolve => (releaseActivation = resolve)),
    )

    const enabling = registerAndSavePush('unused-for-existing-subscription')
    await vi.waitFor(() => expect(waitForActiveServiceWorker).toHaveBeenCalledOnce())
    expect(clearPushBinding).not.toHaveBeenCalled()

    releaseActivation(registration as unknown as ServiceWorkerRegistration)
    await enabling
    expect(waitForActiveServiceWorker).toHaveBeenCalledWith(registration, { timeoutMs: 5000 })
    expect(clearPushBinding).toHaveBeenCalledOnce()
  })

  it('waits for worker activation before bootstrap sends protocol messages', async () => {
    let releaseActivation!: (registration: ServiceWorkerRegistration) => void
    vi.mocked(waitForActiveServiceWorker).mockImplementationOnce(
      () => new Promise(resolve => (releaseActivation = resolve)),
    )
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(registration),
      },
    })
    const bootstrapping = bootstrapPushBinding()
    await vi.waitFor(() => expect(waitForActiveServiceWorker).toHaveBeenCalledOnce())
    expect(bootstrapBindingMock).not.toHaveBeenCalled()

    releaseActivation(registration as unknown as ServiceWorkerRegistration)
    await expect(bootstrapping).resolves.toBeNull()
    expect(waitForActiveServiceWorker).toHaveBeenCalledWith(registration, { timeoutMs: 5000 })
    expect(bootstrapBindingMock).toHaveBeenCalledWith(registration)
  })

  it('skips bootstrap when the browser has no PushManager', async () => {
    Object.defineProperty(window, 'PushManager', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn<VitestLooseMock>() },
    })

    await expect(bootstrapPushBinding()).resolves.toBeNull()

    expect(navigator.serviceWorker.getRegistration).not.toHaveBeenCalled()
    expect(waitForActiveServiceWorker).not.toHaveBeenCalled()
    expect(bootstrapBindingMock).not.toHaveBeenCalled()
  })

  it('skips bootstrap when the registration has no PushManager', async () => {
    const unsupportedRegistration = { active: {} } as ServiceWorkerRegistration
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn<VitestLooseMock>().mockResolvedValue(unsupportedRegistration),
      },
    })

    await expect(bootstrapPushBinding()).resolves.toBeNull()

    expect(waitForActiveServiceWorker).not.toHaveBeenCalled()
    expect(bootstrapBindingMock).not.toHaveBeenCalled()
  })

  it('serializes generation creation across tabs until the winning worker bind completes', async () => {
    let releaseCreate!: () => void
    vi.mocked(createMyWebPushSubscription).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseCreate = () =>
            resolve({
              web_push_subscription: {
                __entity_type: 'web_push_subscription',
                id: subscriptionId,
                user_id: '00000000-0000-7000-8000-000000000001',
                endpoint,
                p256dh: 'p256dh-secret',
                auth: 'auth-secret',
                expiration_time_ms: null,
                user_agent: 'vitest',
                last_success_at: null,
                last_failure_at: null,
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
              },
            })
        }),
    )

    const first = registerAndSavePush('key')
    await vi.waitFor(() => expect(createMyWebPushSubscription).toHaveBeenCalledOnce())
    const second = registerAndSavePush('key')
    await Promise.resolve()
    expect(clearPushBinding).toHaveBeenCalledOnce()

    releaseCreate()
    await expect(first).resolves.toEqual({ id: subscriptionId, endpoint })
    await expect(second).resolves.toEqual({ id: subscriptionId, endpoint })
    expect(clearPushBinding).toHaveBeenCalledTimes(2)
    expect(bindPushBinding).toHaveBeenCalledTimes(2)
  })
})
