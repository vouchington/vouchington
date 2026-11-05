import {
  clickAndSettle,
  MockEventSource,
  mockedGetStatus,
  mockedToast,
  mockedTrigger,
} from '@/test-helpers/app/admin/postgresql/sync-articles-button.mock-support'

import { act, render, screen } from '@testing-library/react'
import { ApiError } from '@vouchington/api-client'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ARTICLE_SYNC_STREAM_REATTACH_MS } from '../article-sync-stream-recovery'
import { SyncArticlesButton } from '../sync-articles-button'

describe('SyncArticlesButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    mockedGetStatus.mockReset()
    mockedTrigger.mockReset()
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

  it('reopens a closed stream after a successful active-status probe, once until an event arrives', async () => {
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-renew' })
    mockedGetStatus.mockResolvedValue({ status: 'active' })
    render(<SyncArticlesButton />)
    await clickAndSettle()

    const first = MockEventSource.instances[0]!
    await act(async () => first.simulateError(true))
    expect(first.closed).toBe(true)
    expect(MockEventSource.instances).toHaveLength(2)

    const second = MockEventSource.instances[1]!
    await act(async () => second.simulateError(true))
    expect(MockEventSource.instances).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()

    await act(async () => {
      second.emit('open', undefined)
      second.simulateError(true)
    })
    expect(MockEventSource.instances).toHaveLength(3)
  })

  it.each([
    ['gateway', new ApiError('bad gateway', 503)],
    ['network', new TypeError('Failed to fetch')],
  ])(
    'reattaches a permanently closed stream after a transient %s probe while the sync is active',
    async (_label, probeError) => {
      mockedTrigger.mockResolvedValueOnce({ jobId: 'job-spot' })
      mockedGetStatus.mockRejectedValueOnce(probeError).mockResolvedValueOnce({ status: 'active' })

      render(<SyncArticlesButton />)
      await clickAndSettle()

      const closed = MockEventSource.instances[0]!
      await act(async () => {
        closed.simulateError(true)
      })
      expect(MockEventSource.instances).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
      expect(mockedToast.error).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(ARTICLE_SYNC_STREAM_REATTACH_MS - 1)
      })
      expect(MockEventSource.instances).toHaveLength(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(mockedGetStatus).toHaveBeenCalledTimes(2)
      expect(MockEventSource.instances).toHaveLength(2)
      expect(MockEventSource.instances[1]?.url).toContain('job-spot')
      expect(MockEventSource.instances[1]?.closed).toBe(false)
      expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
    },
  )

  it('reattaches after the one-shot reopen is exhausted while the sync stays active', async () => {
    mockedTrigger.mockResolvedValueOnce({ jobId: 'job-spot-2' })
    mockedGetStatus.mockResolvedValue({ status: 'active' })

    render(<SyncArticlesButton />)
    await clickAndSettle()

    await act(async () => {
      MockEventSource.instances[0]!.simulateError(true)
    })
    expect(MockEventSource.instances).toHaveLength(2)

    await act(async () => {
      MockEventSource.instances[1]!.simulateError(true)
    })
    expect(MockEventSource.instances).toHaveLength(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ARTICLE_SYNC_STREAM_REATTACH_MS)
    })
    expect(MockEventSource.instances).toHaveLength(3)
    expect(MockEventSource.instances[2]?.url).toContain('job-spot-2')
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
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
