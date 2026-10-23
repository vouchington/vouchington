import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPartitions } from '@/lib/api/client/psql'
import type { PartitionStatusResponseBody } from '@/types/api-responses'
import { PartitionConfirmDialog } from './partition-confirm-dialog'

type PsqlClient = typeof import('@/lib/api/client/psql')

vi.mock(import('@/lib/api/client/psql'), () => ({
  fetchPartitions: vi.fn<PsqlClient['fetchPartitions']>(),
  fetchMigrations: vi.fn<PsqlClient['fetchMigrations']>(),
  enqueuePsqlJob: vi.fn<PsqlClient['enqueuePsqlJob']>(),
}))

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => (key.includes('.cancel_') ? 'Cancel' : 'Confirm'),
}))

const mockedFetchPartitions = vi.mocked(fetchPartitions)

const partitionStatus: PartitionStatusResponseBody = {
  tables: [
    {
      name: 'crawls',
      partition_count: 3,
      total_size_bytes: 0,
      partitions: [
        { name: 'crawls_2026_01', size_bytes: 0, drop_refusal: 'inside-retention' },
        { name: 'crawls_2026_02', size_bytes: 0, drop_refusal: 'check-pending' },
        { name: 'crawls_2026_03', size_bytes: 0, drop_refusal: null },
      ],
    },
  ],
}

describe('PartitionConfirmDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('waits for the backend preview, shows refusals and unchecked children, then confirms cleanup', async () => {
    let resolveStatus!: (status: PartitionStatusResponseBody) => void
    mockedFetchPartitions.mockReturnValue(
      new Promise(resolve => {
        resolveStatus = resolve
      }),
    )
    const confirmPartitionAction = vi.fn<() => void>()
    const setPendingAction =
      vi.fn<(action: 'createPartitions' | 'cleanupPartitions' | null) => void>()

    render(
      <PartitionConfirmDialog
        confirmPartitionAction={confirmPartitionAction}
        pendingAction='cleanupPartitions'
        pendingClassifierRange={null}
        setPendingAction={setPendingAction}
      />,
    )

    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    expect(screen.getByText('Checking partition eligibility…')).toBeVisible()
    fireEvent.click(confirm)
    expect(confirmPartitionAction).not.toHaveBeenCalled()

    await act(async () => resolveStatus(partitionStatus))

    expect(screen.getByText('crawls.crawls_2026_01')).toBeVisible()
    expect(screen.getByText(/still inside its retention window/)).toBeVisible()
    expect(screen.getByText('crawls.crawls_2026_02')).toBeVisible()
    expect(screen.getByText(/backend will check this partition during cleanup/)).toBeVisible()
    expect(screen.queryByText('crawls.crawls_2026_03')).toBeNull()
    expect(confirm).toBeEnabled()

    fireEvent.click(confirm)
    expect(confirmPartitionAction).toHaveBeenCalledOnce()
    expect(setPendingAction).toHaveBeenCalledWith(null)
  })

  it('keeps cleanup disabled on a failed preview and clears the action on cancel', async () => {
    mockedFetchPartitions.mockRejectedValue(new Error('Backend unavailable'))
    const confirmPartitionAction = vi.fn<() => void>()
    const setPendingAction =
      vi.fn<(action: 'createPartitions' | 'cleanupPartitions' | null) => void>()

    render(
      <PartitionConfirmDialog
        confirmPartitionAction={confirmPartitionAction}
        pendingAction='cleanupPartitions'
        pendingClassifierRange={null}
        setPendingAction={setPendingAction}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Partition status unavailable: Backend unavailable',
    )
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(setPendingAction).toHaveBeenCalledWith(null)
    expect(confirmPartitionAction).not.toHaveBeenCalled()
  })

  it('allows partition creation without a cleanup preview', () => {
    const confirmPartitionAction = vi.fn<() => void>()

    render(
      <PartitionConfirmDialog
        confirmPartitionAction={confirmPartitionAction}
        pendingAction='createPartitions'
        pendingClassifierRange={null}
        setPendingAction={vi.fn<
          (action: 'createPartitions' | 'cleanupPartitions' | null) => void
        >()}
      />,
    )

    expect(mockedFetchPartitions).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(confirmPartitionAction).toHaveBeenCalledOnce()
  })

  it('previews only the requested classifier range before retirement', async () => {
    mockedFetchPartitions.mockResolvedValue({
      tables: [
        ...partitionStatus.tables,
        {
          name: 'topic_classifier_results',
          partition_count: 2,
          total_size_bytes: 0,
          partitions: [
            {
              name: 'topic_classifier_results__r_20200201_20200202',
              size_bytes: 0,
              drop_refusal: 'check-pending',
            },
            {
              name: 'topic_classifier_results__r_20200101_20200102',
              size_bytes: 0,
              drop_refusal: 'inside-retention',
            },
          ],
        },
      ],
    })
    const confirmPartitionAction = vi.fn<() => void>()

    render(
      <PartitionConfirmDialog
        confirmPartitionAction={confirmPartitionAction}
        pendingAction='cleanupPartitions'
        pendingClassifierRange={{ fromDate: '2020-02-01', toDate: '2020-02-02' }}
        setPendingAction={vi.fn<
          (action: 'createPartitions' | 'cleanupPartitions' | null) => void
        >()}
      />,
    )

    expect(await screen.findByText('Retire Classifier Range')).toBeVisible()
    expect(
      screen.getByText('topic_classifier_results.topic_classifier_results__r_20200201_20200202'),
    ).toBeVisible()
    expect(screen.queryByText('crawls.crawls_2026_01')).toBeNull()
    expect(
      screen.queryByText('topic_classifier_results.topic_classifier_results__r_20200101_20200102'),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(confirmPartitionAction).toHaveBeenCalledOnce()
  })
})
