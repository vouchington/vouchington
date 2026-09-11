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
