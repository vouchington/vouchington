import {
  initialCategories,
  makeInitialData,
  mockCreate,
  mockDelete,
  mockOnError,
  mockUpdate,
} from '@/test-helpers/components/my/spending-categories-manager.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'
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

  it('renders member-only household categories as read only', () => {
    const category = initialCategories[0]!
    render(
      <SpendingCategoriesManager
        initialSpendingCategories={[{ ...category, owner_type: 'household', can_manage: false }]}
      />,
    )
    expect(document.querySelector('[data-pw="spending-category-read-only"]')).toBeInTheDocument()
    expect(
      document.querySelector('[data-pw="spending-category-edit-button"]'),
    ).not.toBeInTheDocument()
  })

  it('renders initial spending categories list correctly', () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('$150.00 / Monthly')).toBeInTheDocument()
    expect(screen.getByText('Initial coffee expense')).toBeInTheDocument()
  })

  it('always shows the add form and validates inputs', async () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    // Form should always be visible
    expect(screen.getByText('Add a spending category')).toBeInTheDocument()

    // The add button should be disabled until a category is selected
    const submitAddButton = screen.getByRole('button', { name: /^Add$/ })
    expect(submitAddButton).toBeDisabled()

    // Fill in category id to enable the button
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'cat-2' } })

    // Click add (validation error for empty amount)
    fireEvent.click(submitAddButton)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please enter a valid amount' }),
    )

    // Fill in amount
    const amountInput = screen.getByLabelText('Amount')
    fireEvent.change(amountInput, { target: { value: '-10' } })
    fireEvent.click(submitAddButton)
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Please enter a valid amount' }),
    )
  })
})
