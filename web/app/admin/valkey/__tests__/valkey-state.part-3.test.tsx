import {
  emitDefaultSnapshot,
  MockEventSource,
  mockedClearCache,
  mockedFetchCacheGroups,
  mockedFlushValkey,
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
    mockedFlushValkey.mockResolvedValue({ concern: 'caches', keysRemoved: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('reports clear-all failures via onError fallback', async () => {
    mockedClearCache.mockRejectedValueOnce(new Error('Clear-all failed'))

    const { result } = renderHook(() => useValkeyAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setPendingAction({ type: 'clearAll' }))
    await act(async () => {
      await result.current.confirmAction()
    })

    expect(mockedToast.error).toHaveBeenCalledWith('Failed to clear all caches')
    expect(result.current.clearLoading).toEqual({ all: false })
  })

  it('flushes a non-sessions concern without force', async () => {
    mockedFlushValkey.mockResolvedValueOnce({ concern: 'blooms', keysRemoved: 5 })

    const { result } = renderHook(() => useValkeyAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setPendingAction({ type: 'flush', concern: 'blooms' }))
    await act(async () => {
      await result.current.confirmAction()
    })

    expect(mockedFlushValkey).toHaveBeenCalledWith('blooms', false)
    expect(mockedToast.success).toHaveBeenCalledWith('Flushed blooms (5 keys removed)')
  })

  it('flushes sessions with force and reports failures via onError fallback', async () => {
    mockedFlushValkey.mockRejectedValueOnce(new Error('Flush failed'))

    const { result } = renderHook(() => useValkeyAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setPendingAction({ type: 'flush', concern: 'sessions' }))
    await act(async () => {
      await result.current.confirmAction()
    })

    expect(mockedFlushValkey).toHaveBeenCalledWith('sessions', true)
    expect(mockedToast.error).toHaveBeenCalledWith('Failed to flush')
    expect(result.current.flushLoading).toEqual({ sessions: false })
  })
})
