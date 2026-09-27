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
