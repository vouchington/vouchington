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

  it('renders the button with "Sync Articles" text', () => {
    render(<SyncArticlesButton />)
    expect(screen.getByRole('button', { name: 'Sync Articles' })).toBeInTheDocument()
  })

  it('shows "Syncing..." while SSE stream is open after click', async () => {
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-1' })

    render(<SyncArticlesButton />)
    await clickAndSettle()

    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
    expect(MockEventSource.instances[0]?.url).toContain('job-1')
  })

  it('shows result summary and success toast on completed SSE status event', async () => {
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-1' })

    render(<SyncArticlesButton />)
    await clickAndSettle()

    const es = MockEventSource.instances[0]!
    await act(async () => {
      es.emit('status', {
        status: 'completed',
        result: {
          results: [],
          summary: { created: 2, updated: 1, skipped: 3, errored: 0 },
        },
      })
    })

    expect(mockedToast.success).toHaveBeenCalledWith(
      'Articles synced: 2 created, 1 updated, 3 skipped',
    )
    expect(screen.getByText(/2 created, 1 updated, 3 unchanged, 0 errors/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync Articles' })).toBeEnabled()
    expect(es.closed).toBe(true)
  })

  it('shows error toast on failed SSE status event', async () => {
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-1' })

    render(<SyncArticlesButton />)
    await clickAndSettle()

    const es = MockEventSource.instances[0]!
    await act(async () => {
      es.emit('status', { status: 'failed', error: 'Git pull failed' })
    })

    expect(mockedToast.error).toHaveBeenCalledWith('Sync failed: Git pull failed')
    expect(screen.getByRole('button', { name: 'Sync Articles' })).toBeEnabled()
    expect(es.closed).toBe(true)
  })

  it('shows "already triggered recently" toast on 409', async () => {
    const { ApiError } = await import('@/lib/api/error')
    mockedTrigger.mockRejectedValueOnce(new ApiError('Conflict', 409))

    render(<SyncArticlesButton />)
    await clickAndSettle()

    expect(mockedToast.error).toHaveBeenCalledWith('An article sync was already triggered recently')
    expect(screen.getByRole('button', { name: 'Sync Articles' })).toBeEnabled()
  })

  it('shows generic trigger error toast for non-409 failures', async () => {
    mockedTrigger.mockRejectedValueOnce(new Error('Network down'))

    render(<SyncArticlesButton />)
    await clickAndSettle()

    expect(mockedToast.error).toHaveBeenCalledWith('Failed to trigger article sync')
    expect(screen.getByRole('button', { name: 'Sync Articles' })).toBeEnabled()
  })

  it('checks REST status without closing the stream on transient EventSource errors', async () => {
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-2' })
    mockedGetStatus.mockResolvedValueOnce({ status: 'active' })

    render(<SyncArticlesButton />)
    await clickAndSettle()

    const es = MockEventSource.instances[0]!

    await act(async () => {
      es.simulateError()
    })
    expect(mockedGetStatus).toHaveBeenCalledWith('job-2')
    expect(es.closed).toBe(false)
    expect(MockEventSource.instances).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
  })

  it('surfaces stream-open failures through the REST status probe', async () => {
    const { ApiError } = await import('@/lib/api/error')
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-open-fail' })
    mockedGetStatus.mockRejectedValueOnce(new ApiError('Unauthorized', 401))

    render(<SyncArticlesButton />)
    await clickAndSettle()

    const es = MockEventSource.instances[0]!
    await act(async () => {
      es.simulateError()
    })

    expect(mockedToast.error).toHaveBeenCalledWith('Failed to track article sync status')
    expect(screen.getByRole('button', { name: 'Sync Articles' })).toBeEnabled()
    expect(es.closed).toBe(true)
  })
})
