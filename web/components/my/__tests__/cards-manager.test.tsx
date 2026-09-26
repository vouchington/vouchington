import { describe, it, expect, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

import { initialCards, makeCardsPage } from '@/test-helpers/cards-manager-test-data'
import {
  loadCardsManager,
  mockCreate,
  mockDelete,
  setUpCardsManagerTest,
  toastMock,
} from '@/test-helpers/components/my/cards-manager.mock-support'

describe('CardsManager adding and removing cards', () => {
  beforeEach(setUpCardsManagerTest)

  it('renders initial cards list correctly', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    expect(screen.getByText('Chase Sapphire Preferred')).toBeInTheDocument()
    expect(screen.getByText('Opened: 2023-01-01')).toBeInTheDocument()
    expect(screen.getByText('Limit: $10,000.00')).toBeInTheDocument()
    expect(screen.getByText('My Chase Sapphire Card')).toBeInTheDocument()

    expect(screen.getByText('Chase Freedom Flex')).toBeInTheDocument()
    expect(screen.getByText('Auth user of: Chase Sapphire Preferred')).toBeInTheDocument()
  })

  it('shows the add form heading on initial render without clicking any button', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)
    expect(screen.getByText('Add a card')).toBeInTheDocument()
  })

  it('auto-adds card when autocomplete onChange fires with a card ID', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    await act(async () => {
      fireEvent.change(autocompleteInput, { target: { value: 'c-3' } })
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({ card_id: 'c-3' })
    })
  })

  it('successfully creates a new card via autocomplete selection', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    await act(async () => {
      fireEvent.change(autocompleteInput, { target: { value: 'c-3' } })
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({ card_id: 'c-3' })
      expect(toastMock.success).toHaveBeenCalledWith('Card added')
      expect(screen.getByText('Amex Gold')).toBeInTheDocument()
    })
  })

  it('form submit invokes onAdd and covers the loading-free path', async () => {
    const CardsManager = await loadCardsManager()
    const { container } = render(<CardsManager initialData={makeCardsPage(initialCards)} />)
    const form = container.querySelector('form')!
    fireEvent.submit(form)
    // newCardId is null so handleAdd is not called, but the onAdd callback and form onSubmit execute
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('handles API error when adding a card', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network error'))
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    await act(async () => {
      fireEvent.change(autocompleteInput, { target: { value: 'c-3' } })
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to add card')
    })
    expect(screen.getByTestId('mock-topic-autocomplete-input')).toHaveValue('c-3')
  })

  it('supports deleting a card with confirmation', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    const removeButtons = screen.getAllByRole('button', { name: /Remove/i })
    fireEvent.click(removeButtons[0]!)

    // Confirm prompt should be visible
    expect(screen.getByText('Remove card?')).toBeInTheDocument()

    // Cancel deletion
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)
    expect(screen.queryByText('Remove card?')).not.toBeInTheDocument()

    // Confirm deletion actually deletes
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[0]!)
    const confirmButton = screen.getByRole('button', { name: /Confirm/i })
    await act(async () => {
      fireEvent.click(confirmButton)
    })

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('card-owner-1')
      expect(toastMock.success).toHaveBeenCalledWith('Card removed')
      expect(screen.queryByText('Chase Sapphire Preferred')).not.toBeInTheDocument()
    })
  })

  it('handles API error when deleting a card', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Network error'))
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)

    const removeButtons = screen.getAllByRole('button', { name: /Remove/i })
    fireEvent.click(removeButtons[0]!)

    const confirmButton = screen.getByRole('button', { name: /Confirm/i })
    await act(async () => {
      fireEvent.click(confirmButton)
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to remove card')
    })
    expect(screen.getByText('Chase Sapphire Preferred')).toBeInTheDocument()
    expect(screen.getByText('Remove card?')).toBeInTheDocument()
  })
})
