import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  initialPointValuationData,
  initialPointValuations,
  installPointValuationMockResponses,
  mockCreatePointValuation,
  mockDeletePointValuation,
  mockPointValuationOnError,
  mockPointValuationOnSuccess,
  mockUpdatePointValuation,
} from '@/test-helpers/components/my/point-valuations-manager.mock-support'
// Imported after the mock helper so its vi.mock factories run first.
import { PointValuationsManager } from '../point-valuations-manager'

import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import { seedMessages } from '@/lib/i18n/use-translations'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'

describe('PointValuationsManager Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installPointValuationMockResponses()
  })

  it('renders initial point valuations list correctly', () => {
    render(<PointValuationsManager initialData={initialPointValuationData} />)

    expect(screen.getByText('Chase Ultimate Rewards')).toBeInTheDocument()
    expect(screen.getByText('$0.015 per point')).toBeInTheDocument()
    expect(screen.getByText('Initial note')).toBeInTheDocument()
  })

  it('formats and translates value-per-point summaries with the active UI locale', () => {
    seedMessages('es', esMessages)

    render(
      <UiLocaleContext.Provider value='es'>
        <PointValuationsManager initialData={initialPointValuationData} />
      </UiLocaleContext.Provider>,
    )

    expect(screen.getByText('0,015 US$ por punto')).toBeInTheDocument()
    expect(screen.queryByText('$0.015 per point')).not.toBeInTheDocument()
  })

  it('translates add and edit value-per-point labels with the active UI locale', () => {
    seedMessages('es', esMessages)

    render(
      <UiLocaleContext.Provider value='es'>
        <PointValuationsManager initialData={initialPointValuationData} />
      </UiLocaleContext.Provider>,
    )

    expect(screen.getByLabelText('Valor por punto')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getAllByLabelText('Valor por punto')).toHaveLength(2)
    expect(screen.queryByLabelText('Value per point')).not.toBeInTheDocument()
  })

  it('renders a legacy terminal response without page_info', () => {
    render(<PointValuationsManager initialData={{ results: initialPointValuations }} />)

    expect(screen.getByText('Chase Ultimate Rewards')).toBeInTheDocument()
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
  })

  it('always shows the add form and validates inputs', async () => {
    render(<PointValuationsManager initialData={initialPointValuationData} />)

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
    expect(mockPointValuationOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please enter a valid value per point' }),
    )

    // Fill in invalid negative value per point
    const cppInput = screen.getByLabelText('Value per point')
    fireEvent.change(cppInput, { target: { value: '-1.5' } })
    fireEvent.click(submitAddButton)
    expect(mockPointValuationOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please enter a valid value per point' }),
    )
  })

  it('rejects overflowing value-per-point values before add and save requests', () => {
    render(<PointValuationsManager initialData={initialPointValuationData} />)

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

    expect(mockCreatePointValuation).not.toHaveBeenCalled()
    expect(mockUpdatePointValuation).not.toHaveBeenCalled()
    expect(mockPointValuationOnError).toHaveBeenCalledTimes(2)
  })

  it('successfully creates a new point valuation', async () => {
    render(<PointValuationsManager initialData={initialPointValuationData} />)

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
      expect(mockCreatePointValuation).toHaveBeenCalledWith({
        rewards_program_id: 'prog-2',
        value_per_point: { amount: 20_000, currency: 'usd', scale: 6 },
        note: 'New program note',
      })
      expect(mockPointValuationOnSuccess).toHaveBeenCalledWith('Point valuation added')
      expect(screen.getByText('Amex Membership Rewards')).toBeInTheDocument()
      expect(screen.getByText('$0.02 per point')).toBeInTheDocument()
    })
  })

  it('supports editing a point valuation', async () => {
    render(<PointValuationsManager initialData={initialPointValuationData} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    // Both edit and add forms visible; edit form is first in DOM
    const cppInput = screen.getAllByLabelText('Value per point')[0]!
    expect(cppInput).toHaveValue('0.015')

    // Edit cpp to invalid value and save
    fireEvent.change(cppInput, { target: { value: '' } })
    const saveButton = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveButton)
    expect(mockPointValuationOnError).toHaveBeenCalledWith(
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
      expect(mockUpdatePointValuation).toHaveBeenCalledWith('pv-1', {
        value_per_point: { amount: 18_000, currency: 'usd', scale: 6 },
        note: 'Updated Chase Note',
      })
      expect(mockPointValuationOnSuccess).toHaveBeenCalledWith('Point valuation updated')
      expect(screen.getByText('$0.018 per point')).toBeInTheDocument()
      expect(screen.getByText('Updated Chase Note')).toBeInTheDocument()
    })
  })

  it('supports cancelling edit mode without saving changes', async () => {
    render(<PointValuationsManager initialData={initialPointValuationData} />)

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
