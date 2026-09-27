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

  it('supports editing a spending category', async () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    // Edit fields — both edit and add forms are visible, pick the edit form's inputs
    // (edit form comes first in DOM order, add form is below)
    const amountInput = screen.getAllByLabelText('Amount')[0]!
    expect(amountInput).toHaveValue('150')

    // Edit amount to invalid and try to save
    fireEvent.change(amountInput, { target: { value: '' } })
    const saveButton = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveButton)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please enter a valid amount' }),
    )

    // Edit amount, frequency, and note
    fireEvent.change(amountInput, { target: { value: '180' } })

    const frequencySelect = screen.getAllByLabelText('Frequency')[0]!
    fireEvent.change(frequencySelect, { target: { value: 'annually' } })

    const noteInput = screen.getAllByLabelText('Note')[0]!
    fireEvent.change(noteInput, { target: { value: 'Updated Coffee Note' } })

    // Click Save
    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('sc-1', {
        amount: { amount: 18_000, currency: 'usd' },
        spending_frequency: 'annually',
        note: 'Updated Coffee Note',
      })
      expect(mockOnSuccess).toHaveBeenCalledWith('Spending category updated')
      expect(screen.getByText('$180.00 / Annually')).toBeInTheDocument()
      expect(screen.getByText('Updated Coffee Note')).toBeInTheDocument()
    })
  })

  it('supports canceling out of editing', () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    const editButton = screen.getByRole('button', { name: /Edit/i })
    fireEvent.click(editButton)

    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)

    // Edit form is closed; only the add form's Amount input remains
    expect(screen.getAllByLabelText('Amount')).toHaveLength(1)
    expect(screen.getByText('$150.00 / Monthly')).toBeInTheDocument()
  })
})
