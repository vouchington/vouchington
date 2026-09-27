import {
  makeInitialData,
  mockCreate,
  mockDelete,
  mockOnError,
  mockOnSuccess,
  mockUpdate,
} from '@/test-helpers/components/my/spending-categories-manager.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '@/lib/api/error'
import { SpendingCategoriesManager } from '../spending-categories-manager'

describe('SpendingCategoriesManager Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({
      spending_category: {
        id: 'sc-2',
        spending_category_id: 'cat-2',
        amount: { amount: 20_000, currency: 'usd' },
        spending_frequency: 'monthly',
        note: 'Grocery note',
        spending_category: {
          id: 'cat-2',
          name: 'Grocery',
          slug: 'grocery',
        },
      },
    } as any)
    mockUpdate.mockResolvedValue({
      spending_category: {
        id: 'sc-1',
        spending_category_id: 'cat-1',
        amount: { amount: 18_000, currency: 'usd' },
        spending_frequency: 'annually',
        note: 'Updated Coffee Note',
        spending_category: {
          id: 'cat-1',
          name: 'Coffee',
          slug: 'coffee',
        },
      },
    } as any)
    mockDelete.mockResolvedValue(undefined as any)
  })

  it('supports deleting a spending category with confirmation', async () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    const removeButton = screen.getByRole('button', { name: /Remove/i })
    fireEvent.click(removeButton)

    // Should show confirmation buttons
    expect(screen.getByText('Remove?')).toBeInTheDocument()
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })

    // Test cancelling delete
    fireEvent.click(cancelButton)
    expect(screen.queryByText('Remove?')).not.toBeInTheDocument()

    // Click Remove again, then Confirm
    fireEvent.click(screen.getByRole('button', { name: /Remove/i }))
    const confirmButtonNew = screen.getByRole('button', { name: /Confirm/i })

    await act(async () => {
      fireEvent.click(confirmButtonNew)
    })

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('sc-1')
      expect(mockOnSuccess).toHaveBeenCalledWith('Spending category removed')
      expect(screen.queryByText('Coffee')).not.toBeInTheDocument()
    })
  })

  it('handles API error when adding a spending category', async () => {
    mockCreate.mockRejectedValueOnce(new ApiError('Failed to create category', 400))
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'cat-2' } })

    const amountInput = screen.getByLabelText('Amount')
    fireEvent.change(amountInput, { target: { value: '200' } })

    const submitAddButton = screen.getByRole('button', { name: /^Add$/ })
    await act(async () => {
      fireEvent.click(submitAddButton)
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(ApiError),
        expect.objectContaining({ fallback: 'Failed to add spending category' }),
      )
    })
  })

  it('validates no category selected when form is submitted without autocomplete value', () => {
    const { container } = render(<SpendingCategoriesManager initialData={makeInitialData()} />)
    const form = container.querySelector('form')!
    fireEvent.submit(form)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please select a spending category' }),
    )
  })
})
