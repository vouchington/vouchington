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

  it('loads Valkey data on mount via SSE snapshot and closes EventSource on unmount', async () => {
    const { result, unmount } = renderHook(() => useValkeyAdminState())

    expect(MockEventSource.instances[0]).toBeDefined()

    const es = await emitDefaultSnapshot()

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.cacheGroups).toEqual([{ name: 'posts', prefixes: ['post:'] }])

    unmount()

    expect(es.closed).toBe(true)
  })

  it('confirms rebuild, single-cache clear, and all-cache clear actions', async () => {
    const { result } = renderHook(() => useValkeyAdminState())
    await emitDefaultSnapshot()

    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setPendingAction({ type: 'rebuild', target: 'embedding' }))
    await act(async () => {
      await result.current.confirmAction()
    })

    expect(mockedRebuildBloomFilter).toHaveBeenCalledWith('embedding')
    expect(mockedToast.success).toHaveBeenCalledWith('Rebuild job queued')
    expect(result.current.pendingAction).toBeNull()
    expect(result.current.rebuildLoading).toEqual({ embedding: false })

    act(() => result.current.setPendingAction({ type: 'clear', target: 'posts' }))
    await act(async () => {
      await result.current.confirmAction()
    })

    expect(mockedClearCache).toHaveBeenCalledWith('posts')
    expect(mockedToast.success).toHaveBeenCalledWith('Cleared cache group: posts')
    expect(result.current.clearLoading).toEqual({ posts: false })

    act(() => result.current.setPendingAction({ type: 'clearAll' }))
    await act(async () => {
      await result.current.confirmAction()
    })

    expect(mockedClearCache).toHaveBeenCalledWith('all')
    expect(mockedToast.success).toHaveBeenCalledWith('All caches cleared')
    expect(result.current.clearLoading).toEqual({ posts: false, all: false })
  })

  it('SSE snapshot clears a stale REST fallback error', async () => {
    mockedFetchCacheGroups.mockRejectedValueOnce(new Error('Cache groups unavailable'))

    const { result } = renderHook(() => useValkeyAdminState())

    await waitFor(() => expect(result.current.error).toBe('Cache groups unavailable'))

    await emitDefaultSnapshot()

    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.cacheGroups).toEqual([{ name: 'posts', prefixes: ['post:'] }])
  })

  it('SSE snapshot with null groups does not clear a stale REST fallback error', async () => {
    mockedFetchCacheGroups.mockRejectedValueOnce(new Error('Cache groups unavailable'))

    const { result } = renderHook(() => useValkeyAdminState())

    await waitFor(() => expect(result.current.error).toBe('Cache groups unavailable'))

    const es = MockEventSource.instances.at(-1)!
    await act(async () => {
      es.emit('snapshot', { groups: null })
    })

    expect(result.current.error).toBe('Cache groups unavailable')
  })

  it('surfaces Valkey stream refresh errors without clearing stale cache groups', async () => {
    const { result } = renderHook(() => useValkeyAdminState())
    const es = await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      es.emit('snapshot', {
        groups: null,
        errors: { groups: 'Cache groups unavailable' },
      })
    })

    expect(result.current.error).toBe('Cache groups unavailable')
    expect(result.current.cacheGroups).toEqual([{ name: 'posts', prefixes: ['post:'] }])
  })

  it('falls back to periodic REST refreshes when the stream cannot open', async () => {
    mockedFetchCacheGroups
      .mockResolvedValueOnce({ groups: [{ name: 'posts', prefixes: ['post:'] }] })
      .mockResolvedValueOnce({ groups: [{ name: 'users', prefixes: ['user:'] }] })

    const { result } = renderHook(() => useValkeyAdminState())
    const es = MockEventSource.instances[0]!
    vi.useFakeTimers()

    await act(async () => {
      es.simulateError()
      await Promise.resolve()
    })

    expect(es.closed).toBe(false)
    expect(result.current.cacheGroups).toEqual([{ name: 'users', prefixes: ['user:'] }])

    mockedFetchCacheGroups.mockResolvedValueOnce({
      groups: [{ name: 'comments', prefixes: ['comment:'] }],
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(result.current.cacheGroups).toEqual([{ name: 'comments', prefixes: ['comment:'] }])

    await act(async () => {
      es.emit('snapshot', { groups: [{ name: 'stream', prefixes: ['stream:'] }] })
    })
    mockedFetchCacheGroups.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(mockedFetchCacheGroups).not.toHaveBeenCalled()
  })

  it('ignores a stale REST fallback completion after SSE recovers', async () => {
    const { result } = renderHook(() => useValkeyAdminState())
    const es = await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    const staleFallback = defer<{ groups: { name: string; prefixes: string[] }[] }>()
    mockedFetchCacheGroups.mockReturnValueOnce(staleFallback.promise)

    act(() => es.simulateError())
    await waitFor(() => expect(mockedFetchCacheGroups).toHaveBeenCalledTimes(2))

    await act(async () => {
      es.emit('snapshot', { groups: [{ name: 'stream', prefixes: ['stream:'] }] })
      staleFallback.resolve({ groups: [{ name: 'stale-rest', prefixes: ['stale:'] }] })
      await staleFallback.promise
    })

    expect(result.current.cacheGroups).toEqual([{ name: 'stream', prefixes: ['stream:'] }])
    expect(result.current.error).toBeNull()
  })
})
