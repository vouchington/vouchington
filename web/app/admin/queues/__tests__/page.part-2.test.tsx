import {
  createBackfill,
  createScheduledJob,
  mockFetchBackfills,
  mockFetchQueues,
  mockFetchScheduledJobs,
  mockTriggerBackfill,
  mockTriggerScheduledJob,
  toastMock,
} from '@/test-helpers/app/admin/queues/page.mock-support'

import QueuesPage from '../page'

import type { ScheduledJob } from '@/lib/api/client/mq'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function defer<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

describe('QueuesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchBackfills.mockResolvedValue({ backfills: [] })
    mockFetchQueues.mockResolvedValue({ queues: [], total: 0 })
    mockFetchScheduledJobs.mockResolvedValue({ jobs: [createScheduledJob()] })
    mockTriggerBackfill.mockResolvedValue({ success: true })
    mockTriggerScheduledJob.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-refreshes scheduled jobs and backfills every 30 seconds', async () => {
    vi.useFakeTimers()
    mockFetchScheduledJobs
      .mockResolvedValueOnce({ jobs: [createScheduledJob()] })
      .mockResolvedValueOnce({ jobs: [{ ...createScheduledJob(), description: 'Refreshed job' }] })
    mockFetchBackfills.mockResolvedValue({ backfills: [] })

    render(<QueuesPage />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('Scheduled Jobs')).toBeInTheDocument()
    expect(mockFetchScheduledJobs).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(mockFetchScheduledJobs).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Refreshed job')).toBeInTheDocument()
  })

  it('serializes overlapping scheduled job refreshes', async () => {
    vi.useFakeTimers()
    render(<QueuesPage />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('Scheduled Jobs')).toBeInTheDocument()
    expect(mockFetchScheduledJobs).toHaveBeenCalledTimes(1)
    vi.clearAllMocks()

    const scheduledJobs = defer<{ jobs: ScheduledJob[] }>()
    mockFetchScheduledJobs.mockReturnValueOnce(scheduledJobs.promise)
    mockFetchBackfills.mockResolvedValue({ backfills: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(mockFetchScheduledJobs).toHaveBeenCalledTimes(1)

    await act(async () => {
      scheduledJobs.resolve({ jobs: [{ ...createScheduledJob(), description: 'Serialized job' }] })
      await scheduledJobs.promise
    })

    expect(screen.getByText('Serialized job')).toBeInTheDocument()
  })

  it('shows success toast when triggering a backfill succeeds', async () => {
    mockFetchBackfills.mockResolvedValue({ backfills: [createBackfill()] })

    render(<QueuesPage />)

    expect(await screen.findByText('Backfills')).toBeInTheDocument()

    // First click opens the dialog; second click confirms.
    const runButtons = screen.getAllByRole('button', { name: 'Run Backfill' })
    fireEvent.click(runButtons[0]!)
    const confirmButtons = screen.getAllByRole('button', { name: 'Run Backfill' })
    fireEvent.click(confirmButtons.at(-1)!)

    await waitFor(() => {
      expect(mockTriggerBackfill).toHaveBeenCalledWith('backfill-1')
      expect(toastMock.success).toHaveBeenCalledWith(
        'Backfill "Backfill OpenAI post moderation" enqueued',
      )
    })
  })

  it('reports backfill trigger failures via onError fallback', async () => {
    mockFetchBackfills.mockResolvedValue({ backfills: [createBackfill()] })
    mockTriggerBackfill.mockRejectedValueOnce(new Error('Trigger failed'))

    render(<QueuesPage />)

    expect(await screen.findByText('Backfills')).toBeInTheDocument()

    const runButtons = screen.getAllByRole('button', { name: 'Run Backfill' })
    fireEvent.click(runButtons[0]!)
    const confirmButtons = screen.getAllByRole('button', { name: 'Run Backfill' })
    fireEvent.click(confirmButtons.at(-1)!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        'Failed to trigger backfill: Backfill OpenAI post moderation',
      )
    })
  })
})
