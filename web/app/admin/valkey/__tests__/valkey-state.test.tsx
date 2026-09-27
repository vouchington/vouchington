import {
  defer,
  emitDefaultSnapshot,
  MockEventSource,
  mockedClearCache,
  mockedFetchCacheGroups,
  mockedRebuildBloomFilter,
  mockedToast,
} from '@/test-helpers/app/admin/valkey/valkey-state.mock-support'

import { act, renderHook, waitFor } from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useValkeyAdminState } from '../valkey-state'

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
