import { act, renderHook, waitFor } from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearCache, fetchCacheGroups, rebuildBloomFilter } from '@/lib/api/client/valkey'

import { toast } from 'sonner'

import { useValkeyAdminState } from '../valkey-state'

type ValkeyClient = typeof import('@/lib/api/client/valkey')

vi.mock(import('@/lib/api/client/valkey'), () => ({
  clearCache: vi.fn<ValkeyClient['clearCache']>(),
  fetchCacheGroups: vi.fn<ValkeyClient['fetchCacheGroups']>(),
  rebuildBloomFilter: vi.fn<ValkeyClient['rebuildBloomFilter']>(),
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
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockedClearCache = vi.mocked(clearCache)

const mockedFetchCacheGroups = vi.mocked(fetchCacheGroups)

const mockedRebuildBloomFilter = vi.mocked(rebuildBloomFilter)

const mockedToast = vi.mocked(toast)

type ESListener = (event: MessageEvent) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  readonly listeners = new Map<string, Set<ESListener>>()
  onerror: (() => void) | null = null
  closed = false

  constructor() {
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, fn: ESListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: ESListener) {
    this.listeners.get(type)?.delete(fn)
  }

  close() {
    this.closed = true
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) })
    this.listeners.get(type)?.forEach(fn => fn(event))
  }

  simulateError() {
    this.onerror?.()
  }
}

async function emitDefaultSnapshot() {
  const es = MockEventSource.instances.at(-1)!
  await act(async () => {
    es.emit('snapshot', {
      groups: [{ name: 'posts', prefixes: ['post:'] }],
    })
  })
  return es
}

function defer<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useValkeyAdminState', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    mockedFetchCacheGroups.mockResolvedValue({
      groups: [{ name: 'posts', prefixes: ['post:'] }],
    })
    mockedClearCache.mockResolvedValue({ success: true, group: 'posts' })
    mockedRebuildBloomFilter.mockResolvedValue({ success: true, filter: 'embedding' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('does not let slower REST fallback overwrite an empty SSE cache group snapshot', async () => {
    const cacheGroups = defer<{ groups: Array<{ name: string; prefixes: string[] }> }>()
    mockedFetchCacheGroups.mockReturnValueOnce(cacheGroups.promise)

    const { result } = renderHook(() => useValkeyAdminState())
    const es = MockEventSource.instances[0]!

    await act(async () => {
      es.emit('snapshot', {
        groups: [],
      })
    })

    await act(async () => {
      cacheGroups.resolve({ groups: [{ name: 'stale', prefixes: ['stale:'] }] })
      await cacheGroups.promise
    })

    expect(result.current.cacheGroups).toEqual([])
  })

  it('serializes overlapping REST fallback refreshes', async () => {
    const { result } = renderHook(() => useValkeyAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.clearAllMocks()

    const cacheGroups = defer<{ groups: Array<{ name: string; prefixes: string[] }> }>()
    mockedFetchCacheGroups.mockReturnValueOnce(cacheGroups.promise)

    const first = result.current.loadData(true)
    const second = result.current.loadData(true)

    expect(mockedFetchCacheGroups).toHaveBeenCalledTimes(1)

    await act(async () => {
      cacheGroups.resolve({ groups: [{ name: 'users', prefixes: ['user:'] }] })
      await Promise.all([first, second])
    })

    expect(result.current.cacheGroups).toEqual([{ name: 'users', prefixes: ['user:'] }])
  })

  it('treats only literal true as a silent manual refresh', async () => {
    const cacheGroups = defer<{ groups: Array<{ name: string; prefixes: string[] }> }>()

    const { result } = renderHook(() => useValkeyAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockedFetchCacheGroups.mockReturnValueOnce(cacheGroups.promise)

    act(() => {
      void result.current.loadData({} as never)
    })

    expect(result.current.loading).toBe(true)

    await act(async () => {
      cacheGroups.resolve({ groups: [{ name: 'posts', prefixes: ['post:'] }] })
      await cacheGroups.promise
    })

    expect(result.current.loading).toBe(false)
  })

  it('surfaces load failures without dropping successful cache group data via loadData()', async () => {
    mockedFetchCacheGroups
      .mockResolvedValueOnce({ groups: [{ name: 'posts', prefixes: ['post:'] }] })
      .mockRejectedValueOnce(new Error('Cache groups unavailable'))

    const { result } = renderHook(() => useValkeyAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.loadData()
    })

    expect(result.current.error).toBe('Cache groups unavailable')
    expect(result.current.cacheGroups).toEqual([{ name: 'posts', prefixes: ['post:'] }])
  })

  it('reports rebuild failures via onError fallback', async () => {
    mockedRebuildBloomFilter.mockRejectedValueOnce(new Error('Rebuild failed'))

    const { result } = renderHook(() => useValkeyAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setPendingAction({ type: 'rebuild', target: 'embedding' }))
    await act(async () => {
      await result.current.confirmAction()
    })

    expect(mockedToast.error).toHaveBeenCalledWith('Failed to queue rebuild')
    expect(result.current.rebuildLoading).toEqual({ embedding: false })
  })

  it('reports single-group clear failures via onError fallback', async () => {
    mockedClearCache.mockRejectedValueOnce(new Error('Clear failed'))

    const { result } = renderHook(() => useValkeyAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setPendingAction({ type: 'clear', target: 'posts' }))
    await act(async () => {
      await result.current.confirmAction()
    })

    expect(mockedToast.error).toHaveBeenCalledWith('Failed to clear cache')
    expect(result.current.clearLoading).toEqual({ posts: false })
  })
})
