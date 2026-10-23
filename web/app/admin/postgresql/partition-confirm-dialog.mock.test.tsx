import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPartitions, type ExplicitPartitionRange } from '@/lib/api/client/psql'
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
const emptyRange = { table: '', fromId: '', toId: '', maxRows: 1_000 }

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
        partitionRange={emptyRange}
        setPartitionRange={vi.fn<(range: ExplicitPartitionRange) => void>()}
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
        partitionRange={emptyRange}
        setPartitionRange={vi.fn<(range: ExplicitPartitionRange) => void>()}
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

  it('requires a valid bounded UUIDv7 range before creating a partition', () => {
    const confirmPartitionAction = vi.fn<() => void>()
    function Form() {
      const [partitionRange, setPartitionRange] = useState(emptyRange)
      return (
        <PartitionConfirmDialog
          confirmPartitionAction={confirmPartitionAction}
          pendingAction='createPartitions'
          partitionRange={partitionRange}
          setPartitionRange={setPartitionRange}
          setPendingAction={vi.fn<
            (action: 'createPartitions' | 'cleanupPartitions' | null) => void
          >()}
        />
      )
    }

    render(<Form />)

    expect(mockedFetchPartitions).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Table'), {
      target: { value: 'ai_agent_call_receipts' },
    })
    fireEvent.change(screen.getByLabelText('From UUIDv7 (inclusive)'), {
      target: { value: '019a0000-0000-7000-8000-000000000000' },
    })
    fireEvent.change(screen.getByLabelText('To UUIDv7 (exclusive)'), {
      target: { value: '01990000-0000-7000-8000-000000000000' },
    })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('To UUIDv7 (exclusive)'), {
      target: { value: '019b0000-0000-7000-8000-000000000000' },
    })
    fireEvent.change(screen.getByLabelText('Maximum rows to move'), { target: { value: '10001' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Maximum rows to move'), { target: { value: '10000' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(confirmPartitionAction).toHaveBeenCalledOnce()
  })
})
