import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchDynamicConfigNamespace,
  fetchDynamicConfigNamespaceHistory,
  fetchDynamicConfigNamespaces,
  updateDynamicConfigNamespace,
} from '@/lib/api/client/dynamic-config'
import { toast } from 'sonner'
import { useDynamicConfigState } from './dynamic-config-state'

type DynamicConfigClient = typeof import('@/lib/api/client/dynamic-config')

vi.mock(import('@/lib/api/client/dynamic-config'), () => ({
  fetchDynamicConfigNamespace: vi.fn<DynamicConfigClient['fetchDynamicConfigNamespace']>(),
  fetchDynamicConfigNamespaceHistory:
    vi.fn<DynamicConfigClient['fetchDynamicConfigNamespaceHistory']>(),
  fetchDynamicConfigNamespaces: vi.fn<DynamicConfigClient['fetchDynamicConfigNamespaces']>(),
  updateDynamicConfigNamespace: vi.fn<DynamicConfigClient['updateDynamicConfigNamespace']>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return err instanceof Error ? err.message : options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockedFetchNamespace = vi.mocked(fetchDynamicConfigNamespace)
const mockedFetchHistory = vi.mocked(fetchDynamicConfigNamespaceHistory)
const mockedFetchNamespaces = vi.mocked(fetchDynamicConfigNamespaces)
const mockedUpdateNamespace = vi.mocked(updateDynamicConfigNamespace)
const mockedToast = vi.mocked(toast)

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

describe('useDynamicConfigState', () => {
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
    mockedFetchNamespace.mockImplementation(async namespace => ({
      namespace:
        namespace === 'recaptcha-config'
          ? {
              ...featureFlagsNamespace,
              namespace: 'recaptcha-config',
              label: 'reCAPTCHA',
            }
          : featureFlagsNamespace,
    }))
    mockedFetchHistory.mockResolvedValue({ history: [] })
    mockedUpdateNamespace.mockResolvedValue({
      changed: true,
      namespace: {
        ...featureFlagsNamespace,
        config: { memberships: true },
        fields: [{ ...featureFlagsNamespace.fields[0]!, value: true }],
      },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('loads namespace summaries, first namespace details, and history', async () => {
    const { result } = renderHook(() => useDynamicConfigState())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activeNamespace).toBe('feature-flags')
    expect(result.current.namespaces).toHaveLength(2)
    expect(result.current.details?.namespace).toBe('feature-flags')
    expect(mockedFetchHistory).toHaveBeenCalledWith('feature-flags')
  })

  it('selects another namespace', async () => {
    const { result } = renderHook(() => useDynamicConfigState())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.selectNamespace('recaptcha-config')
    })

    expect(result.current.activeNamespace).toBe('recaptcha-config')
    await waitFor(() => expect(result.current.details?.label).toBe('reCAPTCHA'))
  })

  it('ignores stale refresh responses after manually switching namespaces', async () => {
    const staleDetails =
      defer<Awaited<ReturnType<DynamicConfigClient['fetchDynamicConfigNamespace']>>>()
    const staleHistory =
      defer<Awaited<ReturnType<DynamicConfigClient['fetchDynamicConfigNamespaceHistory']>>>()

    const { result } = renderHook(() => useDynamicConfigState())
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.clearAllMocks()

    mockedFetchNamespace.mockImplementation(namespace => {
      if (namespace === 'feature-flags') return staleDetails.promise
      return Promise.resolve({
        namespace: {
          ...featureFlagsNamespace,
          namespace: 'recaptcha-config',
          label: 'reCAPTCHA',
        },
      })
    })
    mockedFetchHistory.mockImplementation(namespace => {
      if (namespace === 'feature-flags') return staleHistory.promise
      return Promise.resolve({ history: [] })
    })

    act(() => {
      void result.current.loadData()
    })
    await waitFor(() => expect(mockedFetchNamespace).toHaveBeenCalledWith('feature-flags'))

    await act(async () => {
      await result.current.selectNamespace('recaptcha-config')
    })

    await act(async () => {
      staleDetails.resolve({ namespace: featureFlagsNamespace })
      staleHistory.resolve({ history: [] })
      await Promise.all([staleDetails.promise, staleHistory.promise])
    })

    expect(result.current.activeNamespace).toBe('recaptcha-config')
    expect(result.current.details?.namespace).toBe('recaptcha-config')
  })

  it('updates a field and reloads history', async () => {
    const { result } = renderHook(() => useDynamicConfigState())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateField('memberships', true)
    })

    expect(mockedUpdateNamespace).toHaveBeenCalledWith('feature-flags', { memberships: true })
    expect(mockedToast.success).toHaveBeenCalledWith('Dynamic config updated')
    expect(result.current.details?.config.memberships).toBe(true)
  })

  it('ignores stale save responses after switching namespaces', async () => {
    const update = defer<Awaited<ReturnType<DynamicConfigClient['updateDynamicConfigNamespace']>>>()
    mockedUpdateNamespace.mockReturnValueOnce(update.promise)

    const { result } = renderHook(() => useDynamicConfigState())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let savePromise: Promise<void>
    act(() => {
      savePromise = result.current.updateField('memberships', true)
    })

    await act(async () => {
      await result.current.selectNamespace('recaptcha-config')
    })

    await act(async () => {
      update.resolve({
        changed: true,
        namespace: {
          ...featureFlagsNamespace,
          config: { memberships: true },
          fields: [{ ...featureFlagsNamespace.fields[0]!, value: true }],
        },
      })
      await savePromise!
    })

    expect(result.current.activeNamespace).toBe('recaptcha-config')
    expect(result.current.details?.namespace).toBe('recaptcha-config')
  })

  it('skips background refresh while a save is in flight', async () => {
    const update = defer<Awaited<ReturnType<DynamicConfigClient['updateDynamicConfigNamespace']>>>()
    mockedUpdateNamespace.mockReturnValueOnce(update.promise)

    const { result } = renderHook(() => useDynamicConfigState())
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.clearAllMocks()

    let savePromise: Promise<void>
    act(() => {
      savePromise = result.current.updateField('memberships', true)
    })
    await waitFor(() => expect(mockedUpdateNamespace).toHaveBeenCalledOnce())

    await act(async () => {
      await result.current.loadData()
    })

    expect(mockedFetchNamespaces).not.toHaveBeenCalled()

    await act(async () => {
      update.resolve({
        changed: true,
        namespace: {
          ...featureFlagsNamespace,
          config: { memberships: true },
          fields: [{ ...featureFlagsNamespace.fields[0]!, value: true }],
        },
      })
      await savePromise!
    })
  })

  it('surfaces load failures', async () => {
    mockedFetchNamespaces.mockRejectedValueOnce(new Error('No config'))

    const { result } = renderHook(() => useDynamicConfigState())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockedToast.error).toHaveBeenCalledWith('Failed to load dynamic config')
    expect(result.current.namespaces).toEqual([])
  })
})
