import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  initialPointValuationData,
  installPointValuationMockResponses,
  mockCreatePointValuation,
  mockDeletePointValuation,
  mockPointValuationOnError,
  mockPointValuationOnSuccess,
  mockUpdatePointValuation,
} from '@/test-helpers/components/my/point-valuations-manager.mock-support'
// Imported after the mock helper so its vi.mock factories run first.
import { PointValuationsManager } from '../point-valuations-manager'

describe('PointValuationsManager Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installPointValuationMockResponses()
  })

  it('supports deleting a point valuation with confirmation', async () => {
    render(<PointValuationsManager initialData={initialPointValuationData} />)

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
      expect(mockDeletePointValuation).toHaveBeenCalledWith('pv-1')
      expect(mockPointValuationOnSuccess).toHaveBeenCalledWith('Point valuation removed')
      expect(screen.queryByText('Chase Ultimate Rewards')).not.toBeInTheDocument()
    })
  })

  it('validates no program selected when form is submitted without a program', () => {
    const { container } = render(<PointValuationsManager initialData={initialPointValuationData} />)
    const form = container.querySelector('form')!
    fireEvent.submit(form)
    expect(mockPointValuationOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please select a rewards program' }),
    )
  })

  it('handles API error when adding a point valuation', async () => {
    mockCreatePointValuation.mockRejectedValueOnce(new Error('Network error'))
    render(<PointValuationsManager initialData={initialPointValuationData} />)

    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'prog-2' } })

    const cppInput = screen.getByLabelText('Value per point')
    fireEvent.change(cppInput, { target: { value: '2.0' } })

    const submitAddButton = screen.getByRole('button', { name: /^Add$/ })
    await act(async () => {
      fireEvent.click(submitAddButton)
    })

    await waitFor(() => {
      expect(mockPointValuationOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to add point valuation' }),
      )
      expect(screen.getByText('Chase Ultimate Rewards')).toBeInTheDocument()
    })
  })

  it('handles API error when updating a point valuation', async () => {
    mockUpdatePointValuation.mockRejectedValueOnce(new Error('Network error'))
    render(<PointValuationsManager initialData={initialPointValuationData} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    const cppInput = screen.getAllByLabelText('Value per point')[0]!
    fireEvent.change(cppInput, { target: { value: '2.0' } })

    const saveButton = screen.getByRole('button', { name: /Save/i })
    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockPointValuationOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to update point valuation' }),
      )
    })
  })

  it('handles API error when deleting a point valuation', async () => {
    mockDeletePointValuation.mockRejectedValueOnce(new Error('Network error'))
    render(<PointValuationsManager initialData={initialPointValuationData} />)

    const removeButton = screen.getByRole('button', { name: /Remove/i })
    fireEvent.click(removeButton)

    const confirmButton = screen.getByRole('button', { name: /Confirm/i })
    await act(async () => {
      fireEvent.click(confirmButton)
    })

    await waitFor(() => {
      expect(mockPointValuationOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to remove point valuation' }),
      )
      expect(screen.getByText('Chase Ultimate Rewards')).toBeInTheDocument()
    })
  })
})
