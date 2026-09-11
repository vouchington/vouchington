import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

import { PointValuationsManager } from '../point-valuations-manager'

import type { PointValuation } from '@/types/my'

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
        aria-label={placeholder ?? 'Rewards program'}
        value={value ?? ''}
        onChange={e => onChange(e.target.value, 'Mocked Program')}
        data-testid='mock-topic-autocomplete-input'
      />
    </div>
  ),
}))

// Mock client API calls
vi.mock(import('@/lib/api/client'), () => ({
  createMyRewardsProgramPointValuation: vi.fn<VitestLooseMock>(),
  updateMyRewardsProgramPointValuation: vi.fn<VitestLooseMock>(),
  deleteMyRewardsProgramPointValuation: vi.fn<VitestLooseMock>(),
}))

import {
  createMyRewardsProgramPointValuation,
  updateMyRewardsProgramPointValuation,
  deleteMyRewardsProgramPointValuation,
} from '@/lib/api/client'

import onError from '@/lib/on-error'

import { onSuccess } from '@/lib/on-error/on-success'

const mockCreate = vi.mocked(createMyRewardsProgramPointValuation)

const mockUpdate = vi.mocked(updateMyRewardsProgramPointValuation)

const mockDelete = vi.mocked(deleteMyRewardsProgramPointValuation)

const mockOnError = vi.mocked(onError)

const mockOnSuccess = vi.mocked(onSuccess)

const initialValuations: PointValuation[] = [
  {
    id: 'pv-1',
    rewards_program_id: 'prog-1',
    value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
    note: 'Initial note',
    rewards_program: {
      id: 'prog-1',
      name: 'Chase Ultimate Rewards',
      slug: 'chase-ur',
    },
  },
]
const initialData = {
  results: initialValuations,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

describe('PointValuationsManager Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({
      point_valuation: {
        id: 'pv-2',
        rewards_program_id: 'prog-2',
        value_per_point: { amount: 20_000, currency: 'usd', scale: 6 },
        note: 'New program note',
        rewards_program: {
          id: 'prog-2',
          name: 'Amex Membership Rewards',
          slug: 'amex-mr',
        },
      },
    } as any)
    mockUpdate.mockResolvedValue({
      point_valuation: {
        id: 'pv-1',
        rewards_program_id: 'prog-1',
        value_per_point: { amount: 18_000, currency: 'usd', scale: 6 },
        note: 'Updated Chase Note',
        rewards_program: {
          id: 'prog-1',
          name: 'Chase Ultimate Rewards',
          slug: 'chase-ur',
        },
      },
    } as any)
    mockDelete.mockResolvedValue(undefined as any)
  })

  it('supports deleting a point valuation with confirmation', async () => {
    render(<PointValuationsManager initialData={initialData} />)

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
      expect(mockDelete).toHaveBeenCalledWith('pv-1')
      expect(mockOnSuccess).toHaveBeenCalledWith('Point valuation removed')
      expect(screen.queryByText('Chase Ultimate Rewards')).not.toBeInTheDocument()
    })
  })

  it('validates no program selected when form is submitted without a program', () => {
    const { container } = render(<PointValuationsManager initialData={initialData} />)
    const form = container.querySelector('form')!
    fireEvent.submit(form)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please select a rewards program' }),
    )
  })

  it('handles API error when adding a point valuation', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network error'))
    render(<PointValuationsManager initialData={initialData} />)

    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'prog-2' } })

    const cppInput = screen.getByLabelText('Value per point')
    fireEvent.change(cppInput, { target: { value: '2.0' } })

    const submitAddButton = screen.getByRole('button', { name: /^Add$/ })
    await act(async () => {
      fireEvent.click(submitAddButton)
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to add point valuation' }),
      )
      expect(screen.getByText('Chase Ultimate Rewards')).toBeInTheDocument()
    })
  })

  it('handles API error when updating a point valuation', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Network error'))
    render(<PointValuationsManager initialData={initialData} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    const cppInput = screen.getAllByLabelText('Value per point')[0]!
    fireEvent.change(cppInput, { target: { value: '2.0' } })

    const saveButton = screen.getByRole('button', { name: /Save/i })
    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to update point valuation' }),
      )
    })
  })

  it('handles API error when deleting a point valuation', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Network error'))
    render(<PointValuationsManager initialData={initialData} />)

    const removeButton = screen.getByRole('button', { name: /Remove/i })
    fireEvent.click(removeButton)

    const confirmButton = screen.getByRole('button', { name: /Confirm/i })
    await act(async () => {
      fireEvent.click(confirmButton)
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to remove point valuation' }),
      )
      expect(screen.getByText('Chase Ultimate Rewards')).toBeInTheDocument()
    })
  })
})
