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

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('renders the extracted loading state before scheduled jobs load', () => {
    mockFetchScheduledJobs.mockReturnValue(new Promise(() => undefined))

    render(<QueuesPage />)

    expect(screen.getByText('Loading scheduled jobs...')).toBeInTheDocument()
  })

  it('renders the extracted full-page error state when the first load fails', async () => {
    mockFetchScheduledJobs.mockRejectedValueOnce(new Error('Queue API unavailable'))

    render(<QueuesPage />)

    expect(await screen.findByText('Queue API unavailable')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Error Loading Scheduled Jobs' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scheduled Jobs' })).not.toBeInTheDocument()
  })

  it('renders the shared inline error alert when refresh fails after jobs loaded', async () => {
    mockFetchScheduledJobs
      .mockResolvedValueOnce({ jobs: [createScheduledJob()] })
      .mockRejectedValueOnce(new Error('Refresh failed'))

    render(<QueuesPage />)

    expect(await screen.findByText('Scheduled Jobs')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockFetchScheduledJobs).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(mockFetchScheduledJobs).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByText('Refresh failed')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Error Loading Scheduled Jobs' }),
    ).not.toBeInTheDocument()
  })

  it('shows success toast when triggering a job succeeds', async () => {
    render(<QueuesPage />)

    expect(await screen.findByText('Scheduled Jobs')).toBeInTheDocument()

    // First click opens the dialog (row button); second click confirms it.
    const triggerButtons = screen.getAllByRole('button', { name: 'Trigger' })
    fireEvent.click(triggerButtons[0]!)
    const confirmButtons = screen.getAllByRole('button', { name: 'Trigger' })
    fireEvent.click(confirmButtons.at(-1)!)

    await waitFor(() => {
      expect(mockTriggerScheduledJob).toHaveBeenCalledWith('job-1')
      expect(toastMock.success).toHaveBeenCalledWith('Job Send scheduled email triggered')
    })
  })

  it('reports trigger failures via onError fallback', async () => {
    mockTriggerScheduledJob.mockRejectedValueOnce(new Error('Trigger failed'))

    render(<QueuesPage />)

    expect(await screen.findByText('Scheduled Jobs')).toBeInTheDocument()

    // First click opens the dialog (row button); second click confirms it.
    const triggerButtons = screen.getAllByRole('button', { name: 'Trigger' })
    fireEvent.click(triggerButtons[0]!)
    const confirmButtons = screen.getAllByRole('button', { name: 'Trigger' })
    fireEvent.click(confirmButtons.at(-1)!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to trigger Send scheduled email')
    })
  })

  it('shows the backfills table when backfills are returned', async () => {
    mockFetchBackfills.mockResolvedValue({ backfills: [createBackfill()] })

    render(<QueuesPage />)

    expect(await screen.findByText('Backfills')).toBeInTheDocument()
    expect(screen.getByText('Backfill OpenAI post moderation')).toBeInTheDocument()
  })

  it('hides the backfills section when fetchBackfills returns empty', async () => {
    render(<QueuesPage />)

    expect(await screen.findByText('Scheduled Jobs')).toBeInTheDocument()
    expect(screen.queryByText('Backfills')).not.toBeInTheDocument()
  })

  it('still loads scheduled jobs when fetchBackfills fails (fetchBackfills catch path)', async () => {
    mockFetchBackfills.mockRejectedValueOnce(new Error('Backfills unavailable'))

    render(<QueuesPage />)

    expect(await screen.findByText('Scheduled Jobs')).toBeInTheDocument()
    expect(screen.queryByText('Backfills')).not.toBeInTheDocument()
  })
})
