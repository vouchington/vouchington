import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

import { RewardsProgramStatusesManager } from '../rewards-program-statuses-manager'

import type { ListResponse } from '@/types/api-responses'
import type { RewardsProgramStatus } from '@/types/my'

// Mock on-error helpers
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error/on-success'), () => ({
  onSuccess: vi.fn<VitestLooseMock>(),
}))

// Mock autocomplete components
vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({ value, onChange, placeholder }: any) => (
    <div data-testid='mock-topic-autocomplete'>
      <input
        type='text'
        placeholder={placeholder}
        aria-label={placeholder ?? 'Rewards program status'}
        value={value ?? ''}
        onChange={e => onChange(e.target.value, 'Mocked Status')}
        data-testid='mock-topic-autocomplete-input'
      />
    </div>
  ),
}))

// Mock client API calls
vi.mock(import('@/lib/api/client'), () => ({
  createMyRewardsProgramStatus: vi.fn<VitestLooseMock>(),
  updateMyRewardsProgramStatus: vi.fn<VitestLooseMock>(),
  deleteMyRewardsProgramStatus: vi.fn<VitestLooseMock>(),
}))

import {
  createMyRewardsProgramStatus,
  updateMyRewardsProgramStatus,
  deleteMyRewardsProgramStatus,
} from '@/lib/api/client'

import { ApiError } from '@/lib/api/error'

import onError from '@/lib/on-error'

import { onSuccess } from '@/lib/on-error/on-success'

const mockCreate = vi.mocked(createMyRewardsProgramStatus)

const mockUpdate = vi.mocked(updateMyRewardsProgramStatus)

const mockDelete = vi.mocked(deleteMyRewardsProgramStatus)

const mockOnError = vi.mocked(onError)

const mockOnSuccess = vi.mocked(onSuccess)

const initialStatuses: RewardsProgramStatus[] = [
  {
    id: 'status-user-1',
    rewards_program_status_id: 'stat-1',
    since: '2023-01-01',
    until: null,
    rewards_program_status: {
      id: 'stat-1',
      name: 'Delta Medallion Gold',
      slug: 'delta-gold',
    },
  },
]

const initialPage: ListResponse<RewardsProgramStatus> = {
  results: initialStatuses,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

describe('RewardsProgramStatusesManager Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({
      rewards_program_status: {
        id: 'status-user-2',
        rewards_program_status_id: 'stat-2',
        since: null,
        until: null,
        rewards_program_status: {
          id: 'stat-2',
          name: 'Marriott Bonvoy Platinum',
          slug: 'marriott-platinum',
        },
      },
    } as any)
    mockUpdate.mockResolvedValue({
      rewards_program_status: {
        id: 'status-user-1',
        rewards_program_status_id: 'stat-1',
        since: '2023-01-01',
        until: '2024-01-01',
        rewards_program_status: {
          id: 'stat-1',
          name: 'Delta Medallion Gold',
          slug: 'delta-gold',
        },
      },
    } as any)
    mockDelete.mockResolvedValue(undefined as any)
  })

  it('renders initial statuses list correctly', () => {
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    expect(screen.getByText('Delta Medallion Gold')).toBeInTheDocument()
    expect(screen.getByText('Since: 2023-01-01')).toBeInTheDocument()
  })

  it('always shows the add form', () => {
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    // Form should always be visible
    expect(screen.getByText('Add a rewards program status')).toBeInTheDocument()
    expect(screen.getByTestId('mock-topic-autocomplete-input')).toBeInTheDocument()
  })

  it('auto-adds on selection and calls the create API', async () => {
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    // Fill in status via topic autocomplete — triggers auto-add
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    await act(async () => {
      fireEvent.change(autocompleteInput, { target: { value: 'stat-2' } })
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        rewards_program_status_id: 'stat-2',
      })
      expect(mockOnSuccess).toHaveBeenCalledWith('Status added')
      expect(screen.getByText('Marriott Bonvoy Platinum')).toBeInTheDocument()
    })
  })

  it('handles API error when adding a status', async () => {
    mockCreate.mockRejectedValueOnce(new ApiError('Failed to add', 400))
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    await act(async () => {
      fireEvent.change(autocompleteInput, { target: { value: 'stat-2' } })
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(ApiError),
        expect.objectContaining({ fallback: 'Failed to add status' }),
      )
    })
  })

  it('supports editing a status and validates date chronology', async () => {
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    // Edit fields should be open
    const sinceInput = screen.getByLabelText('Since')
    expect(sinceInput).toHaveValue('2023-01-01')

    // Test chronological date validation where since > until
    const untilInput = screen.getByLabelText('Until')
    fireEvent.change(untilInput, { target: { value: '2022-01-01' } })

    const saveButton = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveButton)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Since must be before until' }),
    )

    // Correct until date and save
    fireEvent.change(untilInput, { target: { value: '2024-01-01' } })
    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('status-user-1', {
        until: '2024-01-01',
      })
      expect(mockOnSuccess).toHaveBeenCalledWith('Status updated')
      expect(screen.getByText('Until: 2024-01-01')).toBeInTheDocument()
    })
  })

  it('supports cancelling edit mode without saving changes', async () => {
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    const sinceInput = screen.getByLabelText('Since')
    fireEvent.change(sinceInput, { target: { value: '2025-01-01' } })

    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)

    expect(screen.getByText('Since: 2023-01-01')).toBeInTheDocument()
    expect(screen.queryByLabelText('Since')).not.toBeInTheDocument()
  })

  it('supports deleting a status with confirmation', async () => {
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    const removeButton = screen.getByRole('button', { name: /Remove/i })
    fireEvent.click(removeButton)

    // Confirm prompt should be visible
    expect(screen.getByText('Remove?')).toBeInTheDocument()

    // Cancel deletion
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)
    expect(screen.queryByText('Remove?')).not.toBeInTheDocument()

    // Confirm deletion actually deletes
    fireEvent.click(screen.getByRole('button', { name: /Remove/i }))
    const confirmButton = screen.getByRole('button', { name: /Confirm/i })
    await act(async () => {
      fireEvent.click(confirmButton)
    })

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('status-user-1')
      expect(mockOnSuccess).toHaveBeenCalledWith('Status removed')
      expect(screen.queryByText('Delta Medallion Gold')).not.toBeInTheDocument()
    })
  })
})
