import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { initialCards, makeCardsPage } from '@/test-helpers/cards-manager-test-data'
import {
  loadCardsManager,
  mockCreate,
  mockUpdate,
  setUpCardsManagerTest,
} from '@/test-helpers/components/my/cards-manager.mock-support'

describe('CardsManager keyboard submit', () => {
  beforeEach(setUpCardsManagerTest)

  it('add form is inside a <form> with a submit button for keyboard access', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage([])} />)

    const autocompleteInput = screen.getByTestId(
      'mock-topic-autocomplete-input',
    ) as HTMLInputElement
    // The input must live inside a <form> with a submit control so native Enter works
    const form = autocompleteInput.form
    expect(form).not.toBeNull()
    const submitControl = form!.querySelector(
      'button[type="submit"], button:not([type]), input[type="submit"]',
    )
    expect(submitControl).not.toBeNull()
  })

  it('selecting a card immediately calls createMyCard (auto-add on selection)', async () => {
    // Use a hanging promise so the form does not reset between the change event and the assertion
    mockCreate.mockReturnValue(new Promise(() => {}))
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage([])} />)

    const autocompleteInput = screen.getByTestId(
      'mock-topic-autocomplete-input',
    ) as HTMLInputElement
    fireEvent.change(autocompleteInput, { target: { value: 'c-3' } })

    expect(mockCreate).toHaveBeenCalledWith({ card_id: 'c-3' })
  })

  it('Cmd+Enter on edit note textarea submits', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]!)
    const textarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Updated note' } })
    mockUpdate.mockClear()
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('Ctrl+Enter on edit note textarea submits', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]!)
    const textarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Updated note' } })
    mockUpdate.mockClear()
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('plain Enter on edit note textarea does not submit', async () => {
    const CardsManager = await loadCardsManager()
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]!)
    const textarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Updated note' } })
    mockUpdate.mockClear()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
