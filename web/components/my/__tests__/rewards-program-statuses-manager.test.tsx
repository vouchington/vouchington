import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  initialPage,
  installRewardsProgramStatusMockResponses,
  mockCreate,
  mockDelete,
  mockOnError,
  mockOnSuccess,
  mockUpdate,
} from '@/test-helpers/components/my/rewards-program-statuses-manager.mock-support'
// Imported after the mock helper so its vi.mock factories run first.
import { RewardsProgramStatusesManager } from '../rewards-program-statuses-manager'
import { ApiError } from '@/lib/api/error'

describe('RewardsProgramStatusesManager Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installRewardsProgramStatusMockResponses()
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
        rewards_program_status_topic_id: 'stat-2',
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

    // Test chronological date validation where started_on > expires_on
    const untilInput = screen.getByLabelText('Until')
    fireEvent.change(untilInput, { target: { value: '2022-01-01' } })

    const saveButton = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveButton)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Since must be before until' }),
    )

    // Correct expires_on date and save
    fireEvent.change(untilInput, { target: { value: '2024-01-01' } })
    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('status-user-1', {
        expires_on: '2024-01-01',
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
