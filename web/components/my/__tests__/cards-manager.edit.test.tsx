import { describe, it, expect, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

import { initialCards, makeCardsPage } from '@/test-helpers/cards-manager-test-data'
import {
  loadCardsManager,
  mockUpdate,
  setUpCardsManagerTest,
  toastMock,
} from '@/test-helpers/components/my/cards-manager.mock-support'

describe('CardsManager editing cards', () => {
  beforeEach(setUpCardsManagerTest)

  it('supports editing card properties', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    // Edit the first card
    const editButtons = screen.getAllByRole('button', { name: /Edit/i })
    fireEvent.click(editButtons[0]!)

    // Verify fields
    const limitInput = screen.getByLabelText('Credit limit')
    expect(limitInput).toHaveValue('10000')

    // Test negative credit limit validation
    fireEvent.change(limitInput, { target: { value: '-500' } })
    const saveButton = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveButton)
    expect(toastMock.error).toHaveBeenCalledWith('Credit limit must be a non-negative number')

    // Test editing dates and limit
    fireEvent.change(limitInput, { target: { value: '12000' } })

    const closedInput = screen.getByLabelText('Closed on')
    fireEvent.change(closedInput, { target: { value: '2025-01-01' } })

    const bonusInput = screen.getByLabelText('Sign-up bonus received on')
    fireEvent.change(bonusInput, { target: { value: '2023-04-01' } })

    const noteInput = screen.getByLabelText('Note')
    fireEvent.change(noteInput, { target: { value: 'Updated Note' } })

    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('card-owner-1', {
        credit_limit: { amount: 1_200_000, currency: 'usd' },
        closed_on: '2025-01-01',
        received_sign_up_bonus_on: '2023-04-01',
        note: 'Updated Note',
      })
      expect(toastMock.success).toHaveBeenCalledWith('Card updated')
      expect(screen.getByText('Limit: $12,000.00')).toBeInTheDocument()
      expect(screen.getByText('Closed: 2025-01-01')).toBeInTheDocument()
      expect(screen.getByText('Bonus: 2023-04-01')).toBeInTheDocument()
      expect(screen.getByText('Updated Note')).toBeInTheDocument()
    })
  })

  it('clears an incompatible credit-limit draft when switching to JPY', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]!)
    const limitInput = screen.getByLabelText('Credit limit') as HTMLInputElement
    fireEvent.change(limitInput, { target: { value: '12.00' } })
    const currencySelect = document.querySelector<HTMLSelectElement>('#limit-currency-card-owner-1')
    expect(currencySelect).not.toBeNull()

    fireEvent.change(currencySelect!, { target: { value: 'jpy' } })

    expect(limitInput).toHaveAttribute('inputmode', 'decimal')
    expect(limitInput.value).toBe('')
  })

  it('supports toggling authorized user flag', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    // Edit the second card (which starts as authorized user)
    const editButtons = screen.getAllByRole('button', { name: /Edit/i })
    fireEvent.click(editButtons[1]!)

    const authCheckbox = screen.getByTestId('mock-checkbox')
    expect(authCheckbox).toBeChecked()

    // Select input for "authorized user of" should be visible
    expect(screen.getByLabelText('Authorized user of')).toBeInTheDocument()

    // Uncheck authorized user checkbox
    fireEvent.click(authCheckbox)
    expect(authCheckbox).not.toBeChecked()
    expect(screen.queryByLabelText('Authorized user of')).not.toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: /Save/i })

    // Save updated mock values
    mockUpdate.mockResolvedValueOnce({
      card: {
        ...initialCards[1]!,
        is_authorized_user: false,
        authorized_user_of_id: null,
      },
    })

    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('card-owner-2', {
        is_authorized_user: false,
        authorized_user_of_id: null,
      })
      expect(screen.queryByText('Auth user of: Chase Sapphire Preferred')).not.toBeInTheDocument()
    })
  })

  it('allows selecting authorized user eligibility cards', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    // Edit the first card (starts as NOT authorized user)
    const editButtons = screen.getAllByRole('button', { name: /Edit/i })
    fireEvent.click(editButtons[0]!)

    const authCheckbox = screen.getByTestId('mock-checkbox')
    fireEvent.click(authCheckbox)

    const authSelect = screen.getByLabelText('Authorized user of')
    fireEvent.change(authSelect, { target: { value: 'card-owner-2' } })

    const saveButton = screen.getByRole('button', { name: /Save/i })
    mockUpdate.mockResolvedValueOnce({
      card: {
        ...initialCards[0]!,
        is_authorized_user: true,
        authorized_user_of_id: 'card-owner-2',
      },
    })

    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('card-owner-1', {
        is_authorized_user: true,
        authorized_user_of_id: 'card-owner-2',
      })
      expect(screen.getByText('Auth user of: Chase Freedom Flex')).toBeInTheDocument()
    })
  })

  it('handles API error when updating a card', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Network error'))
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    const editButtons = screen.getAllByRole('button', { name: /Edit/i })
    fireEvent.click(editButtons[0]!)

    const limitInput = screen.getByLabelText('Credit limit')
    fireEvent.change(limitInput, { target: { value: '15000' } })

    const saveButton = screen.getByRole('button', { name: /Save/i })
    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update card')
    })
    expect(screen.getByLabelText('Credit limit')).toHaveValue('15000')
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument()
  })
})
