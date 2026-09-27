import {
  clickAndSettle,
  MockEventSource,
  mockedGetStatus,
  mockedToast,
  mockedTrigger,
} from '@/test-helpers/app/admin/postgresql/sync-articles-button.mock-support'

import { act, render, screen } from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SyncArticlesButton } from '../sync-articles-button'

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
