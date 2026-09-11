import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

import { PointValuationsManager } from '../point-valuations-manager'

import type { PointValuation } from '@/types/my'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import { seedMessages } from '@/lib/i18n/use-translations'
import esMessages from '@ts-shared/ui-messages/messages/es'

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

  it('renders initial point valuations list correctly', () => {
    render(<PointValuationsManager initialData={initialData} />)

    expect(screen.getByText('Chase Ultimate Rewards')).toBeInTheDocument()
    expect(screen.getByText('$0.015 per point')).toBeInTheDocument()
    expect(screen.getByText('Initial note')).toBeInTheDocument()
  })

  it('formats and translates value-per-point summaries with the active UI locale', () => {
    seedMessages('es', esMessages)

    render(
      <UiLocaleContext.Provider value='es'>
        <PointValuationsManager initialData={initialData} />
      </UiLocaleContext.Provider>,
    )

    expect(screen.getByText('0,015 US$ por punto')).toBeInTheDocument()
    expect(screen.queryByText('$0.015 per point')).not.toBeInTheDocument()
  })

  it('translates add and edit value-per-point labels with the active UI locale', () => {
    seedMessages('es', esMessages)

    render(
      <UiLocaleContext.Provider value='es'>
        <PointValuationsManager initialData={initialData} />
      </UiLocaleContext.Provider>,
    )

    expect(screen.getByLabelText('Valor por punto')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getAllByLabelText('Valor por punto')).toHaveLength(2)
    expect(screen.queryByLabelText('Value per point')).not.toBeInTheDocument()
  })

  it('renders a legacy terminal response without page_info', () => {
    render(<PointValuationsManager initialData={{ results: initialValuations }} />)

    expect(screen.getByText('Chase Ultimate Rewards')).toBeInTheDocument()
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
  })

  it('always shows the add form and validates inputs', async () => {
    render(<PointValuationsManager initialData={initialData} />)

    // Form should always be visible
    expect(screen.getByText('Add a point valuation')).toBeInTheDocument()

    // The add button should be disabled until a program is selected
    const submitAddButton = screen.getByRole('button', { name: /^Add$/ })
    expect(submitAddButton).toBeDisabled()

    // Fill in program via topic autocomplete
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'prog-2' } })

    // Click add (validation error for an empty or invalid value per point)
    fireEvent.click(submitAddButton)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please enter a valid value per point' }),
    )

    // Fill in invalid negative value per point
    const cppInput = screen.getByLabelText('Value per point')
    fireEvent.change(cppInput, { target: { value: '-1.5' } })
    fireEvent.click(submitAddButton)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please enter a valid value per point' }),
    )
  })

  it('rejects overflowing value-per-point values before add and save requests', () => {
    render(<PointValuationsManager initialData={initialData} />)

    fireEvent.change(screen.getByTestId('mock-topic-autocomplete-input'), {
      target: { value: 'prog-2' },
    })
    const addInput = screen.getByLabelText('Value per point')
    fireEvent.change(addInput, { target: { value: '10000' } })
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }))

    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))
    const editInput = screen.getAllByLabelText('Value per point')[0]!
    fireEvent.change(editInput, { target: { value: '10000' } })
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))

    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockOnError).toHaveBeenCalledTimes(2)
  })

  it('successfully creates a new point valuation', async () => {
    render(<PointValuationsManager initialData={initialData} />)

    // Fill in program
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'prog-2' } })

    // Fill in value per point
    const cppInput = screen.getByLabelText('Value per point')
    fireEvent.change(cppInput, { target: { value: '0.02' } })

    // Fill in note
    const noteInput = screen.getByLabelText('Note (optional)')
    fireEvent.change(noteInput, { target: { value: 'New program note' } })

    const submitAddButton = screen.getByRole('button', { name: /^Add$/ })
    await act(async () => {
      fireEvent.click(submitAddButton)
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        rewards_program_id: 'prog-2',
        value_per_point: { amount: 20_000, currency: 'usd', scale: 6 },
        note: 'New program note',
      })
      expect(mockOnSuccess).toHaveBeenCalledWith('Point valuation added')
      expect(screen.getByText('Amex Membership Rewards')).toBeInTheDocument()
      expect(screen.getByText('$0.02 per point')).toBeInTheDocument()
    })
  })

  it('supports editing a point valuation', async () => {
    render(<PointValuationsManager initialData={initialData} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    // Both edit and add forms visible; edit form is first in DOM
    const cppInput = screen.getAllByLabelText('Value per point')[0]!
    expect(cppInput).toHaveValue('0.015')

    // Edit cpp to invalid value and save
    fireEvent.change(cppInput, { target: { value: '' } })
    const saveButton = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveButton)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please enter a valid value per point' }),
    )

    // Edit cpp to positive value and note
    fireEvent.change(cppInput, { target: { value: '0.018' } })
    const noteInput = screen.getByLabelText('Note')
    fireEvent.change(noteInput, { target: { value: 'Updated Chase Note' } })

    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('pv-1', {
        value_per_point: { amount: 18_000, currency: 'usd', scale: 6 },
        note: 'Updated Chase Note',
      })
      expect(mockOnSuccess).toHaveBeenCalledWith('Point valuation updated')
      expect(screen.getByText('$0.018 per point')).toBeInTheDocument()
      expect(screen.getByText('Updated Chase Note')).toBeInTheDocument()
    })
  })

  it('supports cancelling edit mode without saving changes', async () => {
    render(<PointValuationsManager initialData={initialData} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    const cppInput = screen.getAllByLabelText('Value per point')[0]!
    fireEvent.change(cppInput, { target: { value: '2.5' } })

    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)

    expect(screen.getByText('$0.015 per point')).toBeInTheDocument()
    // Edit form is gone; only the add form's value-per-point input remains
    expect(screen.getAllByLabelText('Value per point')).toHaveLength(1)
  })
})
