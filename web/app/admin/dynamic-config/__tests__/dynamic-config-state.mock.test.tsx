import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchDynamicConfigNamespace,
  fetchDynamicConfigNamespaceHistory,
  fetchDynamicConfigNamespaces,
  updateDynamicConfigNamespace,
} from '@/lib/api/client/dynamic-config'
import { useDynamicConfigState } from '../dynamic-config-state'

type DynamicConfigClient = typeof import('@/lib/api/client/dynamic-config')

vi.mock(import('@/lib/api/client/dynamic-config'), () => ({
  fetchDynamicConfigNamespace: vi.fn<DynamicConfigClient['fetchDynamicConfigNamespace']>(),
  fetchDynamicConfigNamespaceHistory:
    vi.fn<DynamicConfigClient['fetchDynamicConfigNamespaceHistory']>(),
  fetchDynamicConfigNamespaces: vi.fn<DynamicConfigClient['fetchDynamicConfigNamespaces']>(),
  updateDynamicConfigNamespace: vi.fn<DynamicConfigClient['updateDynamicConfigNamespace']>(),
}))

const mockedFetchNamespace = vi.mocked(fetchDynamicConfigNamespace)
const mockedFetchHistory = vi.mocked(fetchDynamicConfigNamespaceHistory)
const mockedFetchNamespaces = vi.mocked(fetchDynamicConfigNamespaces)
const mockedUpdateNamespace = vi.mocked(updateDynamicConfigNamespace)

const featureFlagsNamespace = {
  namespace: 'feature-flags',
  label: 'Feature Flags',
  description: 'Runtime feature toggles',
  field_count: 1,
  can_view: true,
  can_update: true,
  config: { memberships: false },
  fields: [
    {
      name: 'memberships',
      type: 'boolean' as const,
      value: false,
      default_value: false,
      description: 'memberships',
    },
  ],
}

function defer<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useDynamicConfigState background refresh', () => {
  beforeEach(() => {
    mockedFetchNamespaces.mockResolvedValue({
      namespaces: [
        {
          namespace: 'feature-flags',
          label: 'Feature Flags',
          description: 'Runtime feature toggles',
          field_count: 1,
          can_view: true,
          can_update: true,
        },
      ],
    })
    mockedFetchNamespace.mockResolvedValue({ namespace: featureFlagsNamespace })
    mockedFetchHistory.mockResolvedValue({ history: [] })
    mockedUpdateNamespace.mockResolvedValue({
      changed: false,
      namespace: featureFlagsNamespace,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reloads the active namespace from the polling interval', async () => {
    const intervalHandlers: VoidFunction[] = []
    const originalSetInterval = globalThis.setInterval
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((handler, timeout) => {
        if (timeout === 10_000 && typeof handler === 'function') {
          intervalHandlers.push(() => {
            handler()
          })
          return 0 as unknown as ReturnType<typeof setInterval>
        }
        return originalSetInterval(handler, timeout)
      })

    try {
      const { result } = renderHook(() => useDynamicConfigState())
      await waitFor(() => expect(result.current.loading).toBe(false))
      vi.clearAllMocks()

      const intervalHandler = intervalHandlers[0]
      if (!intervalHandler) throw new Error('Expected background refresh interval')
      await act(async () => {
        intervalHandler()
      })

      await waitFor(() => expect(mockedFetchNamespaces).toHaveBeenCalledOnce())
      expect(mockedFetchNamespace).toHaveBeenCalledWith('feature-flags')
      expect(mockedFetchHistory).toHaveBeenCalledWith('feature-flags')
    } finally {
      setIntervalSpy.mockRestore()
    }
  })

  it('keeps a manual selection when it resolves while a background refresh is still fetching the namespace list', async () => {
    const namespaceList =
      defer<Awaited<ReturnType<DynamicConfigClient['fetchDynamicConfigNamespaces']>>>()
    const targetDetails =
      defer<Awaited<ReturnType<DynamicConfigClient['fetchDynamicConfigNamespace']>>>()
    const targetHistory =
      defer<Awaited<ReturnType<DynamicConfigClient['fetchDynamicConfigNamespaceHistory']>>>()

    const { result } = renderHook(() => useDynamicConfigState())
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.clearAllMocks()

    // Background refresh: the namespace list itself is still in flight.
    mockedFetchNamespaces.mockReturnValue(namespaceList.promise)
    mockedFetchNamespace.mockImplementation(namespace =>
      namespace === 'recaptcha-config'
        ? targetDetails.promise
        : Promise.resolve({ namespace: featureFlagsNamespace }),
    )
    mockedFetchHistory.mockImplementation(namespace =>
      namespace === 'recaptcha-config' ? targetHistory.promise : Promise.resolve({ history: [] }),
    )

    act(() => {
      void result.current.loadData()
    })
    await waitFor(() => expect(mockedFetchNamespaces).toHaveBeenCalledTimes(1))

    // The admin clicks a namespace while the refresh's list fetch is still pending.
    act(() => {
      void result.current.selectNamespace('recaptcha-config')
    })
    await waitFor(() => expect(mockedFetchNamespace).toHaveBeenCalledWith('recaptcha-config'))

    // The list fetch resolves next; the refresh must not revert the selection the click already made.
    await act(async () => {
      namespaceList.resolve({
        namespaces: [
          {
            namespace: 'feature-flags',
            label: 'Feature Flags',
            description: 'Runtime feature toggles',
            field_count: 1,
            can_view: true,
            can_update: true,
          },
          {
            namespace: 'recaptcha-config',
            label: 'reCAPTCHA',
            description: 'Runtime reCAPTCHA controls',
            field_count: 2,
            can_view: true,
            can_update: true,
          },
        ],
      })
      await waitFor(() => expect(mockedFetchNamespace).toHaveBeenCalledTimes(2))
    })

    await act(async () => {
      targetDetails.resolve({
        namespace: { ...featureFlagsNamespace, namespace: 'recaptcha-config', label: 'reCAPTCHA' },
      })
      targetHistory.resolve({ history: [] })
      await Promise.all([targetDetails.promise, targetHistory.promise])
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activeNamespace).toBe('recaptcha-config')
    expect(result.current.details?.namespace).toBe('recaptcha-config')
  })
})
