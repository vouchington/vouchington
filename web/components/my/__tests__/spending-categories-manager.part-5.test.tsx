import {
  makeInitialData,
  mockCreate,
  mockDelete,
  mockOnError,
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
        spending_category_topic_id: 'cat-2',
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
        spending_category_topic_id: 'cat-1',
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

  it('closes edit mode without calling update API if no fields are changed', async () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    const saveButton = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveButton)

    expect(mockUpdate).not.toHaveBeenCalled()
    // Edit form is gone; only the add form's Amount input remains
    expect(screen.getAllByLabelText('Amount')).toHaveLength(1)
  })

  it('handles API error when updating a spending category', async () => {
    mockUpdate.mockRejectedValueOnce(new ApiError('Failed to update category', 400))
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    const amountInput = screen.getAllByLabelText('Amount')[0]!
    fireEvent.change(amountInput, { target: { value: '180' } })

    const saveButton = screen.getByRole('button', { name: /Save/i })
    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(ApiError),
        expect.objectContaining({ fallback: 'Failed to update spending category' }),
      )
    })
  })

  it('handles API error when deleting a spending category', async () => {
    mockDelete.mockRejectedValueOnce(new ApiError('Failed to delete category', 400))
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    fireEvent.click(screen.getByRole('button', { name: /Remove/i }))
    const confirmButton = screen.getByRole('button', { name: /Confirm/i })

    await act(async () => {
      fireEvent.click(confirmButton)
    })

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(ApiError),
        expect.objectContaining({ fallback: 'Failed to remove spending category' }),
      )
    })
  })
})
