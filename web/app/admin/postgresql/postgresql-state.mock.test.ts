import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueuePsqlJob, fetchMigrations } from '@/lib/api/client/psql'
import { usePostgreSQLAdminState } from './postgresql-state'

type PsqlClient = typeof import('@/lib/api/client/psql')

vi.mock(import('@/lib/api/client/psql'), () => ({
  enqueuePsqlJob: vi.fn<PsqlClient['enqueuePsqlJob']>(),
  fetchMigrations: vi.fn<PsqlClient['fetchMigrations']>(),
  fetchPartitions: vi.fn<PsqlClient['fetchPartitions']>(),
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
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockedEnqueue = vi.mocked(enqueuePsqlJob)
const mockedFetch = vi.mocked(fetchMigrations)

// Minimal EventSource stub so usePostgreSQLAdminState's SSE useEffect does not throw.
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

const EMPTY_STATUS = {
  applied: [],
  pending: [],
  total: 0,
} as never

/** Emit the default snapshot so the hook's loading state becomes false. */
async function emitDefaultSnapshot() {
  const es = MockEventSource.instances.at(-1)!
  await act(async () => {
    es.emit('snapshot', EMPTY_STATUS)
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

describe('usePostgreSQLAdminState', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    mockedFetch.mockResolvedValue(EMPTY_STATUS)
    mockedEnqueue.mockResolvedValue({ success: true } as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('loads status via SSE snapshot and closes EventSource on unmount', async () => {
    const { result, unmount } = renderHook(() => usePostgreSQLAdminState())

    expect(MockEventSource.instances[0]).toBeDefined()

    const es = await emitDefaultSnapshot()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.status).toMatchObject({ applied: [], pending: [], total: 0 })

    unmount()
    expect(es.closed).toBe(true)
  })

  it('reports handleAction failures via onError fallback', async () => {
    mockedEnqueue.mockRejectedValueOnce(new Error('Enqueue failed'))

    const { result } = renderHook(() => usePostgreSQLAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleAction('runMigrations')
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to run runMigrations')
    expect(result.current.actionLoading.runMigrations).toBe(false)
  })

  it('confirmPartitionAction runs the queued partition action', async () => {
    const { result } = renderHook(() => usePostgreSQLAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setPendingAction('createPartitions')
    })

    await act(async () => {
      await result.current.confirmPartitionAction()
    })

    expect(mockedEnqueue).toHaveBeenCalledWith('createPartitions')
    expect(toastMock.success).toHaveBeenCalledWith('createPartitions job queued')
    expect(result.current.pendingAction).toBeNull()
  })

  it('SSE snapshot clears a stale REST fallback error', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('REST failed'))

    const { result } = renderHook(() => usePostgreSQLAdminState())

    // Wait for the REST fallback to fail and set error.
    await waitFor(() => expect(result.current.error).not.toBeNull())

    // Now a successful SSE snapshot arrives — error must be cleared.
    await emitDefaultSnapshot()

    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.status).toMatchObject({ applied: [], pending: [], total: 0 })
  })

  it('surfaces PostgreSQL stream refresh errors without clearing stale status', async () => {
    const { result } = renderHook(() => usePostgreSQLAdminState())
    const es = await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      es.emit('snapshot', { error: 'Migration status unavailable' })
    })

    expect(result.current.error).toBe('Migration status unavailable')
    expect(result.current.status).toMatchObject({ applied: [], pending: [], total: 0 })
  })

  it('falls back to periodic REST refreshes when the stream cannot open', async () => {
    mockedFetch
      .mockResolvedValueOnce(EMPTY_STATUS)
      .mockResolvedValueOnce({ applied: ['001-init.sql'], pending: [], total: 1 } as never)

    const { result } = renderHook(() => usePostgreSQLAdminState())
    const es = MockEventSource.instances[0]!
    vi.useFakeTimers()

    await act(async () => {
      es.simulateError()
      await Promise.resolve()
    })

    expect(es.closed).toBe(false)
    expect(result.current.status?.applied).toEqual(['001-init.sql'])

    mockedFetch.mockResolvedValueOnce({
      applied: ['001-init.sql', '002-next.sql'],
      pending: [],
      total: 2,
    } as never)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(result.current.status?.applied).toEqual(['001-init.sql', '002-next.sql'])

    await act(async () => {
      es.emit('snapshot', { applied: ['003-stream.sql'], pending: [], total: 1 })
    })
    mockedFetch.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('ignores a stale REST fallback completion after SSE recovers', async () => {
    const { result } = renderHook(() => usePostgreSQLAdminState())
    const es = await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    const staleFallback = defer<{ applied: string[]; pending: string[]; total: number }>()
    mockedFetch.mockReturnValueOnce(staleFallback.promise)

    act(() => es.simulateError())
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2))

    await act(async () => {
      es.emit('snapshot', { applied: ['stream.sql'], pending: [], total: 1 })
      staleFallback.resolve({ applied: ['stale-rest.sql'], pending: [], total: 1 })
      await staleFallback.promise
    })

    expect(result.current.status?.applied).toEqual(['stream.sql'])
    expect(result.current.error).toBeNull()
  })

  it('manual loadData() fetches fresh status without putting the page in loading state', async () => {
    const { result } = renderHook(() => usePostgreSQLAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockedFetch.mockResolvedValueOnce({
      applied: ['001-init.sql'],
      pending: [],
      total: 1,
    } as never)

    await act(async () => {
      await result.current.loadData(true)
    })

    // Silent mode — loading must stay false throughout
    expect(result.current.loading).toBe(false)
    expect(result.current.status?.applied).toHaveLength(1)
  })

  it('serializes overlapping REST fallback refreshes', async () => {
    const { result } = renderHook(() => usePostgreSQLAdminState())
    await emitDefaultSnapshot()
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.clearAllMocks()

    const status = defer<{ applied: string[]; pending: string[]; total: number }>()
    mockedFetch.mockReturnValueOnce(status.promise)

    const first = result.current.loadData(true)
    const second = result.current.loadData(true)

    expect(mockedFetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      status.resolve({
        applied: ['001-init.sql'],
        pending: [],
        total: 1,
      } as never)
      await Promise.all([first, second])
    })

    expect(result.current.status?.applied).toEqual(['001-init.sql'])
  })
})
