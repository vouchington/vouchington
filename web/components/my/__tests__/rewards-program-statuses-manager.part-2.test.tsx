import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  initialPage,
  initialStatuses,
  installRewardsProgramStatusMockResponses,
  mockCreate,
  mockDelete,
  mockOnError,
  mockUpdate,
  type UpdateRewardsProgramStatusResult,
} from '@/test-helpers/components/my/rewards-program-statuses-manager.mock-support'
// Imported after the mock helper so its vi.mock factories run first.
import { RewardsProgramStatusesManager } from '../rewards-program-statuses-manager'
import type { RewardsProgramStatus } from '@/types/my'

describe('RewardsProgramStatusesManager Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installRewardsProgramStatusMockResponses()
  })

  it('handles API error when updating a status', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Network error'))
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    const untilInput = screen.getByLabelText('Until')
    fireEvent.change(untilInput, { target: { value: '2024-01-01' } })

    const saveButton = screen.getByRole('button', { name: /Save/i })
    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to update status' }),
      )
    })
  })

  it('keeps a newer edit open when an earlier save completes', async () => {
    let resolveFirstSave: (value: UpdateRewardsProgramStatusResult) => void
    const firstSave = new Promise<UpdateRewardsProgramStatusResult>(resolve => {
      resolveFirstSave = resolve
    })
    mockUpdate.mockReturnValueOnce(firstSave)
    const secondStatus: RewardsProgramStatus = {
      id: 'status-user-2',
      rewards_program_status_topic_id: 'stat-2',
      started_on: null,
      expires_on: null,
      rewards_program_status: {
        id: 'stat-2',
        name: 'Marriott Bonvoy Platinum',
        slug: 'marriott-platinum',
      },
    }
    render(
      <RewardsProgramStatusesManager
        initialPage={{ ...initialPage, results: [...initialStatuses, secondStatus] }}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]!)
    fireEvent.change(screen.getByLabelText('Since'), { target: { value: '2024-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))
    expect(screen.getByText('Marriott Bonvoy Platinum')).toBeInTheDocument()
    expect(screen.getByLabelText('Since')).toHaveValue('')

    await act(async () => {
      resolveFirstSave!({
        rewards_program_status: { ...initialStatuses[0], started_on: '2024-01-01' },
      } as UpdateRewardsProgramStatusResult)
      await firstSave
    })

    expect(screen.getByText('Marriott Bonvoy Platinum')).toBeInTheDocument()
    expect(screen.getByLabelText('Since')).toHaveValue('')
  })

  it('handles API error when deleting a status', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Network error'))
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    const removeButton = screen.getByRole('button', { name: /Remove/i })
    fireEvent.click(removeButton)

    const confirmButton = screen.getByRole('button', { name: /Confirm/i })
    await act(async () => {
      fireEvent.click(confirmButton)
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to remove status' }),
      )
    })
  })

  it('form submit with status id set calls onAdd (covers add-status-form onSubmit)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('First attempt fails'))
    const { container } = render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    await act(async () => {
      fireEvent.change(autocompleteInput, { target: { value: 'stat-2' } })
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to add status' }),
      )
    })

    // newStatusId='stat-2' is still set (auto-add failed); form submit invokes onAdd(newStatusId)
    const form = container.querySelector('form')!
    await act(async () => {
      fireEvent.submit(form)
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(2)
    })
  })
})
