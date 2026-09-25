import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyWebPushSubscriptionsClient } from '@/lib/api/client/my'
import { MemoryLockManager } from '@/lib/api/client/admission-idempotency-test-helpers'
import {
  beginPushBindingReconciliation,
  bindPushBinding,
  clearPushBinding,
  readOrInitializePushBinding,
} from '@/lib/push-service-worker'
import type { WebPushSubscription } from '@/types/api-responses'
import {
  bootstrapAuthenticatedPushBinding,
  beginPushBindingReconciliationAtAuthenticationBoundary,
} from './push-bootstrap'

vi.mock(import('@/lib/api/client/my'), () => ({
  getMyWebPushSubscriptionsClient: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/push-service-worker'), () => ({
  bindPushBinding: vi.fn<VitestLooseMock>(),
  beginPushBindingReconciliation: vi.fn<VitestLooseMock>(),
  clearPushBinding: vi.fn<VitestLooseMock>(),
  readOrInitializePushBinding: vi.fn<VitestLooseMock>(),
}))

const endpoint = 'https://push.example.test/subscription'
const revision = 'bootstrap-revision'
const mockPushManager = { getSubscription: vi.fn<VitestLooseMock>() }
const registration = {
  pushManager: mockPushManager,
  unregister: vi.fn<VitestLooseMock>(),
} as unknown as ServiceWorkerRegistration

function makeSubscription(id: string, subscriptionEndpoint: string): WebPushSubscription {
  return {
    __entity_type: 'web_push_subscription',
    id,
    user_id: 'user-1',
    endpoint: subscriptionEndpoint,
    p256dh: 'key',
    auth: 'auth',
    expiration_time_ms: null,
    user_agent: '',
    last_success_at: null,
    last_failure_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('bootstrapAuthenticatedPushBinding', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(beginPushBindingReconciliation).mockResolvedValue({
      status: 'reconciling',
      revision,
    })
    vi.mocked(clearPushBinding).mockResolvedValue({ status: 'disabled', revision })
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: new MemoryLockManager(),
    })
  })

  it('does not overwrite an existing disabled worker state', async () => {
    vi.mocked(readOrInitializePushBinding).mockResolvedValue({
      status: 'disabled',
      binding: { endpoint, subscription_id: 'old-generation' },
      revision: 'disabled-revision',
    })

    await expect(bootstrapAuthenticatedPushBinding(registration)).resolves.toBeNull()
    expect(getMyWebPushSubscriptionsClient).not.toHaveBeenCalled()
    expect(mockPushManager.getSubscription).not.toHaveBeenCalled()
  })

  it('clears and rebinds an existing binding only after the current account proves it', async () => {
    const binding = { endpoint, subscription_id: 'current-generation' }
    vi.mocked(readOrInitializePushBinding).mockResolvedValue({
      status: 'bound',
      binding,
      revision: 'prior-revision',
    })
    vi.mocked(beginPushBindingReconciliation).mockResolvedValue({
      status: 'reconciling',
      binding,
      revision,
    })
    vi.mocked(bindPushBinding).mockResolvedValue({ status: 'bound', binding, revision })
    mockPushManager.getSubscription.mockResolvedValue({ endpoint })
    vi.mocked(getMyWebPushSubscriptionsClient).mockResolvedValue({
      results: [makeSubscription('current-generation', endpoint)],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    await expect(bootstrapAuthenticatedPushBinding(registration)).resolves.toEqual(binding)
    expect(beginPushBindingReconciliation).toHaveBeenCalledWith(registration)
    expect(bindPushBinding).toHaveBeenCalledWith(registration, binding, revision)
    expect(clearPushBinding).not.toHaveBeenCalled()
  })

  it('leaves a foreign account binding disabled', async () => {
    const binding = { endpoint, subscription_id: 'foreign-generation' }
    vi.mocked(readOrInitializePushBinding).mockResolvedValue({
      status: 'bound',
      binding,
      revision: 'foreign-revision',
    })
    vi.mocked(beginPushBindingReconciliation).mockResolvedValue({
      status: 'reconciling',
      binding,
      revision,
    })
    mockPushManager.getSubscription.mockResolvedValue({ endpoint })
    vi.mocked(getMyWebPushSubscriptionsClient).mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    await expect(bootstrapAuthenticatedPushBinding(registration)).resolves.toBeNull()
    expect(bindPushBinding).not.toHaveBeenCalled()
    expect(clearPushBinding).toHaveBeenCalledWith(registration)
  })

  it('unregisters the worker when authentication reconciliation is not acknowledged', async () => {
    vi.mocked(beginPushBindingReconciliation).mockRejectedValue(new Error('no acknowledgement'))

    await expect(
      beginPushBindingReconciliationAtAuthenticationBoundary(registration),
    ).rejects.toThrow('no acknowledgement')
    expect(registration.unregister).toHaveBeenCalledOnce()
  })

  it('paginates server subscriptions and initializes only an exact physical endpoint match', async () => {
    vi.mocked(readOrInitializePushBinding).mockResolvedValue({ status: 'uninitialized' })
    vi.mocked(bindPushBinding).mockResolvedValue({
      status: 'bound',
      binding: { endpoint, subscription_id: 'current-generation' },
      revision,
    })
    mockPushManager.getSubscription.mockResolvedValue({ endpoint })
    vi.mocked(getMyWebPushSubscriptionsClient)
      .mockResolvedValueOnce({
        results: [makeSubscription('other', 'https://push.example.test/other')],
        page_info: { has_next_page: true, start_cursor: null, end_cursor: 'next' },
      })
      .mockResolvedValueOnce({
        results: [makeSubscription('current-generation', endpoint)],
        page_info: { has_next_page: false, start_cursor: 'next', end_cursor: null },
      })

    await expect(bootstrapAuthenticatedPushBinding(registration)).resolves.toEqual({
      endpoint,
      subscription_id: 'current-generation',
    })
    expect(getMyWebPushSubscriptionsClient).toHaveBeenNthCalledWith(1, { limit: 100 })
    expect(getMyWebPushSubscriptionsClient).toHaveBeenNthCalledWith(2, {
      after: 'next',
      limit: 100,
    })
    expect(beginPushBindingReconciliation).toHaveBeenCalledWith(registration)
    expect(bindPushBinding).toHaveBeenCalledWith(
      registration,
      { endpoint, subscription_id: 'current-generation' },
      revision,
    )
  })

  it('retries an interrupted first-time bootstrap for a later account', async () => {
    vi.mocked(readOrInitializePushBinding)
      .mockResolvedValueOnce({ status: 'uninitialized' })
      .mockResolvedValueOnce({ status: 'reconciling', revision })
    mockPushManager.getSubscription.mockResolvedValue({ endpoint })
    vi.mocked(getMyWebPushSubscriptionsClient)
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        results: [makeSubscription('current-generation', endpoint)],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })
    const binding = { endpoint, subscription_id: 'current-generation' }
    vi.mocked(bindPushBinding).mockResolvedValue({ status: 'bound', binding, revision })

    await expect(bootstrapAuthenticatedPushBinding(registration)).rejects.toThrow(
      'temporary failure',
    )
    await expect(bootstrapAuthenticatedPushBinding(registration)).resolves.toEqual(binding)
    expect(beginPushBindingReconciliation).toHaveBeenCalledTimes(2)
    expect(getMyWebPushSubscriptionsClient).toHaveBeenCalledTimes(2)
    expect(bindPushBinding).toHaveBeenCalledOnce()
  })

  it('serializes staggered bootstraps and preserves the proven binding', async () => {
    const binding = { endpoint, subscription_id: 'current-generation' }
    vi.mocked(readOrInitializePushBinding)
      .mockResolvedValueOnce({ status: 'bound', binding, revision: 'bound-revision' })
      .mockResolvedValueOnce({ status: 'bound', binding, revision })
    vi.mocked(beginPushBindingReconciliation).mockResolvedValue({
      status: 'reconciling',
      binding,
      revision,
    })
    vi.mocked(bindPushBinding).mockResolvedValue({ status: 'bound', binding, revision })
    mockPushManager.getSubscription.mockResolvedValue({ endpoint })
    let releasePage!: () => void
    vi.mocked(getMyWebPushSubscriptionsClient).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releasePage = () =>
            resolve({
              results: [makeSubscription('current-generation', endpoint)],
              page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
            })
        }),
    )
    vi.mocked(getMyWebPushSubscriptionsClient).mockResolvedValueOnce({
      results: [makeSubscription('current-generation', endpoint)],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    const first = bootstrapAuthenticatedPushBinding(registration)
    await vi.waitFor(() => expect(getMyWebPushSubscriptionsClient).toHaveBeenCalledOnce())
    const second = bootstrapAuthenticatedPushBinding(registration)
    await Promise.resolve()
    expect(readOrInitializePushBinding).toHaveBeenCalledOnce()

    releasePage()
    await expect(first).resolves.toEqual(binding)
    await expect(second).resolves.toEqual(binding)
    expect(beginPushBindingReconciliation).toHaveBeenCalledTimes(2)
    expect(bindPushBinding).toHaveBeenCalledTimes(2)
  })
})
