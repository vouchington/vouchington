import type { ReactNode } from 'react'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import QueuesPage from '../page'

import {
  fetchBackfills,
  fetchQueues,
  fetchScheduledJobs,
  triggerBackfill,
  triggerScheduledJob,
  type Backfill,
  type ScheduledJob,
} from '@/lib/api/client/mq'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

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

vi.mock(
  import('@/components/ui/alert-dialog'),
  () =>
    ({
      AlertDialog: ({ children }: { children: ReactNode }) => children,
      AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
        <button
          type='button'
          onClick={onClick}
        >
          {children}
        </button>
      ),
      AlertDialogCancel: ({ children }: { children: ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
      AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    }) as unknown as typeof import('@/components/ui/alert-dialog'),
)

vi.mock(import('@/lib/api/client/mq'), () => ({
  fetchBackfills: vi.fn<VitestLooseMock>(),
  fetchQueues: vi.fn<VitestLooseMock>(),
  fetchScheduledJobs: vi.fn<VitestLooseMock>(),
  pauseQueue: vi.fn<VitestLooseMock>(),
  resumeQueue: vi.fn<VitestLooseMock>(),
  triggerBackfill: vi.fn<VitestLooseMock>(),
  triggerScheduledJob: vi.fn<VitestLooseMock>(),
}))

const mockFetchBackfills = vi.mocked(fetchBackfills)

const mockFetchQueues = vi.mocked(fetchQueues)

const mockFetchScheduledJobs = vi.mocked(fetchScheduledJobs)

const mockTriggerBackfill = vi.mocked(triggerBackfill)

const mockTriggerScheduledJob = vi.mocked(triggerScheduledJob)

function createBackfill(): Backfill {
  return {
    id: 'backfill-1',
    queue_name: 'openai_moderation_omni_single',
    job_name: 'backfill_posts',
    description: 'Backfill OpenAI post moderation',
    source_table: 'posts',
  }
}

function createScheduledJob(): ScheduledJob {
  return {
    id: 'job-1',
    queue_name: 'emails',
    job_name: 'sendEmail',
    schedule: '*/5 * * * *',
    description: 'Send scheduled email',
  }
}

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
