import { act, renderHook, waitFor } from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearCache,
  fetchCacheGroups,
  flushValkey,
  rebuildBloomFilter,
} from '@/lib/api/client/valkey'

import { toast } from 'sonner'

import { useValkeyAdminState } from '../valkey-state'

type ValkeyClient = typeof import('@/lib/api/client/valkey')

vi.mock(import('@/lib/api/client/valkey'), () => ({
  clearCache: vi.fn<ValkeyClient['clearCache']>(),
  fetchCacheGroups: vi.fn<ValkeyClient['fetchCacheGroups']>(),
  flushValkey: vi.fn<ValkeyClient['flushValkey']>(),
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

const mockedFlushValkey = vi.mocked(flushValkey)

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
