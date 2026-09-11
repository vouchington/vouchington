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
    let resolveFirstSave: (value: Awaited<ReturnType<typeof updateMyRewardsProgramStatus>>) => void
    const firstSave = new Promise<Awaited<ReturnType<typeof updateMyRewardsProgramStatus>>>(
      resolve => {
        resolveFirstSave = resolve
      },
    )
    mockUpdate.mockReturnValueOnce(firstSave)
    const secondStatus: RewardsProgramStatus = {
      id: 'status-user-2',
      rewards_program_status_id: 'stat-2',
      since: null,
      until: null,
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
        rewards_program_status: { ...initialStatuses[0], since: '2024-01-01' },
      } as Awaited<ReturnType<typeof updateMyRewardsProgramStatus>>)
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
