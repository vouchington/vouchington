import { act, fireEvent, render, screen } from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getArticleSyncStatus, triggerArticleSync } from '@/lib/api/client/admin'

import { toast } from 'sonner'

import { SyncArticlesButton } from '../sync-articles-button'

type AdminClient = typeof import('@/lib/api/client/admin')

vi.mock(import('@/lib/api/client/admin'), () => ({
  getArticleSyncStatus: vi.fn<AdminClient['getArticleSyncStatus']>(),
  triggerArticleSync: vi.fn<AdminClient['triggerArticleSync']>(),
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

vi.mock(import('@/lib/api/error'), () => {
  class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  }
  return { ApiError }
})

const mockedTrigger = vi.mocked(triggerArticleSync)

const mockedGetStatus = vi.mocked(getArticleSyncStatus)

const mockedToast = vi.mocked(toast)

// Minimal EventSource stub for SSE-based sync status stream.
type ESListener = (event: MessageEvent) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  readonly url: string
  readonly listeners = new Map<string, Set<ESListener>>()
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
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
    if (this.onerror) this.onerror()
  }
}

/** Click the sync button and flush microtasks so the trigger promise settles. */
async function clickAndSettle() {
  fireEvent.click(screen.getByRole('button', { name: 'Sync Articles' }))
  await act(async () => {
    /* microtask flush */
  })
}

describe('SyncArticlesButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('ignores terminal status events from stale streams', async () => {
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-stale-1' })
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-stale-2' })

    render(<SyncArticlesButton />)
    await clickAndSettle()
    const staleEs = MockEventSource.instances[0]!

    await act(async () => {
      staleEs.emit('status', {
        status: 'completed',
        result: {
          results: [],
          summary: { created: 0, updated: 0, skipped: 0, errored: 0 },
        },
      })
    })
    expect(screen.getByRole('button', { name: 'Sync Articles' })).toBeEnabled()

    await clickAndSettle()
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()

    await act(async () => {
      staleEs.emit('status', {
        status: 'completed',
        result: {
          results: [],
          summary: { created: 9, updated: 0, skipped: 0, errored: 0 },
        },
      })
    })

    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
    expect(screen.queryByText(/9 created/)).toBeNull()
  })

  it('ignores stale REST probe failures after the stream completes', async () => {
    let rejectStatus!: (reason: unknown) => void
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-probe-race' })
    mockedGetStatus.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectStatus = reject
      }),
    )

    render(<SyncArticlesButton />)
    await clickAndSettle()

    const es = MockEventSource.instances[0]!
    await act(async () => {
      es.simulateError()
      es.emit('status', {
        status: 'completed',
        result: {
          results: [],
          summary: { created: 1, updated: 0, skipped: 0, errored: 0 },
        },
      })
      rejectStatus(new Error('stale probe failed'))
    })

    expect(mockedToast.success).toHaveBeenCalledWith(
      'Articles synced: 1 created, 0 updated, 0 skipped',
    )
    expect(mockedToast.error).not.toHaveBeenCalledWith('Failed to track article sync status')
    expect(screen.getByRole('button', { name: 'Sync Articles' })).toBeEnabled()
  })

  it('keeps tracking long-running syncs past the previous timeout duration', async () => {
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-3' })

    render(<SyncArticlesButton />)
    await clickAndSettle()

    await act(async () => {
      vi.advanceTimersByTime(600_000)
    })

    expect(mockedToast.error).not.toHaveBeenCalledWith('Article sync timed out')
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
    expect(MockEventSource.instances[0]?.closed).toBe(false)
  })

  it('does not create timeout state that can fire during a later sync', async () => {
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-1' })
    render(<SyncArticlesButton />)
    await clickAndSettle()
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()

    // Stream resolves successfully — button reenables, pending timeout cleared.
    const es1 = MockEventSource.instances[0]!
    await act(async () => {
      es1.emit('status', {
        status: 'completed',
        result: { results: [], summary: { created: 0, updated: 0, skipped: 0, errored: 0 } },
      })
    })
    expect(screen.getByRole('button', { name: 'Sync Articles' })).toBeEnabled()

    // Second sync — another pending timeout is set.
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-2' })
    await clickAndSettle()

    await act(async () => {
      vi.advanceTimersByTime(600_000)
    })

    expect(mockedToast.error).not.toHaveBeenCalledWith('Article sync timed out')
    expect(mockedToast.success).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
  })
})
