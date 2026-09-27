import {
  makeInitialData,
  mockCreate,
  mockDelete,
  mockOnSuccess,
  mockUpdate,
} from '@/test-helpers/components/my/spending-categories-manager.mock-support'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import { seedMessages } from '@/lib/i18n/use-translations'
import { SpendingCategoriesManager } from '../spending-categories-manager'

describe('SpendingCategoriesManager Integration Flow', () => {
  seedMessages('es', esMessages)

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

  it('successfully creates a new spending category', async () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    // Fill in category
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'cat-2' } })

    // Fill in amount
    const amountInput = screen.getByLabelText('Amount')
    fireEvent.change(amountInput, { target: { value: '200' } })

    // Fill in frequency to monthly
    const frequencySelect = screen.getByLabelText('Frequency')
    fireEvent.change(frequencySelect, { target: { value: 'monthly' } })

    // Fill in note
    const noteInput = screen.getByLabelText('Note (optional)')
    fireEvent.change(noteInput, { target: { value: 'Grocery note' } })

    const submitAddButton = screen.getByRole('button', { name: /^Add$/ })
    await act(async () => {
      fireEvent.click(submitAddButton)
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        spending_category_id: 'cat-2',
        amount: { amount: 20_000, currency: 'usd' },
        spending_frequency: 'monthly',
        note: 'Grocery note',
      })
      expect(mockOnSuccess).toHaveBeenCalledWith('Spending category added')
      expect(screen.getByText('Grocery')).toBeInTheDocument()
    })
  })

  it('submits a comma-decimal spending amount using the active locale', async () => {
    render(
      <UiLocaleContext.Provider value='es'>
        <SpendingCategoriesManager initialData={makeInitialData()} />
      </UiLocaleContext.Provider>,
    )

    fireEvent.change(screen.getByTestId('mock-topic-autocomplete-input'), {
      target: { value: 'cat-2' },
    })
    const amountInput = document.querySelector<HTMLInputElement>('#new-amount')
    expect(amountInput).not.toBeNull()
    fireEvent.change(amountInput!, { target: { value: '200,25' } })
    fireEvent.submit(amountInput!.closest('form')!)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: { amount: 20_025, currency: 'usd' },
        }),
      )
    })
  })
})
