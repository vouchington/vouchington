import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { Button } from '@/components/ui/button'
import {
  fetchBackfills,
  fetchQueues,
  fetchScheduledJobs,
  triggerBackfill,
  triggerScheduledJob,
  type Backfill,
  type ScheduledJob,
} from '@/lib/api/client/mq'

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

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

vi.mock(
  import('@/components/ui/alert-dialog'),
  () =>
    ({
      AlertDialog: ({ children }: { children: ReactNode }) => children,
      AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
        <Button
          type='button'
          onClick={onClick}
        >
          {children}
        </Button>
      ),
      AlertDialogCancel: ({ children }: { children: ReactNode }) => (
        <Button type='button'>{children}</Button>
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

export {
  createBackfill,
  createScheduledJob,
  mockFetchBackfills,
  mockFetchQueues,
  mockFetchScheduledJobs,
  mockTriggerBackfill,
  mockTriggerScheduledJob,
  toastMock,
}
