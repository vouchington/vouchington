import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CardsManager } from '../cards-manager'
import type { IndividualCard } from '@/types/my'
import { makeCardsPage } from '@/test-helpers/cards-manager-test-data'

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
    info: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({ value, onChange, placeholder }: any) => (
    <div data-testid='mock-topic-autocomplete'>
      <input
        type='text'
        placeholder={placeholder}
        aria-label={placeholder ?? 'Topic'}
        value={value ?? ''}
        onChange={e => onChange(e.target.value, 'Mocked Card')}
        data-testid='mock-topic-autocomplete-input'
      />
    </div>
  ),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: any) => <div>{children}</div>,
      SelectTrigger: () => null,
      SelectValue: () => null,
      SelectContent: () => null,
      SelectItem: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(
  import('@/components/ui/checkbox'),
  () =>
    ({
      Checkbox: ({ checked, onCheckedChange, id }: any) => (
        <input
          type='checkbox'
          id={id}
          checked={checked}
          aria-label='Authorized user'
          onChange={e => onCheckedChange(e.target.checked)}
          data-testid='mock-checkbox'
        />
      ),
    }) as unknown as typeof import('@/components/ui/checkbox'),
)

vi.mock(import('@/lib/api/client'), () => ({
  createMyCard: vi.fn<VitestLooseMock>(),
  updateMyCard: vi.fn<VitestLooseMock>(),
  deleteMyCard: vi.fn<VitestLooseMock>(),
}))

import { createMyCard, updateMyCard } from '@/lib/api/client'

const mockCreate = vi.mocked(createMyCard)
const mockUpdate = vi.mocked(updateMyCard)

const initialCards: IndividualCard[] = [
  {
    id: 'card-owner-1',
    card_id: 'c-1',
    opened_on: '2023-01-01',
    closed_on: null,
    received_sign_up_bonus_on: null,
    credit_limit: { amount: 1_000_000, currency: 'usd' },
    is_authorized_user: false,
    authorized_user_of_id: null,
    note: 'My Chase Sapphire Card',
    authorized_user_of_card: null,
    card: {
      id: 'c-1',
      name: 'Chase Sapphire Preferred',
      slug: 'csp',
    },
  },
]

describe('CardsManager keyboard submit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreate.mockResolvedValue({
      card: {
        id: 'card-owner-3',
        card_id: 'c-3',
        opened_on: null,
        closed_on: null,
        received_sign_up_bonus_on: null,
        credit_limit: null,
        is_authorized_user: false,
        authorized_user_of_id: null,
        note: null,
        card: { id: 'c-3', name: 'Amex Gold', slug: 'amex-gold' },
      },
    } as never)
    mockUpdate.mockResolvedValue({
      card: {
        ...initialCards[0]!,
        note: 'Updated',
      },
    } as never)
  })

  it('add form is inside a <form> with a submit button for keyboard access', () => {
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

  it('selecting a card immediately calls createMyCard (auto-add on selection)', () => {
    // Use a hanging promise so the form does not reset between the change event and the assertion
    mockCreate.mockReturnValue(new Promise(() => {}))
    render(<CardsManager initialData={makeCardsPage([])} />)

    const autocompleteInput = screen.getByTestId(
      'mock-topic-autocomplete-input',
    ) as HTMLInputElement
    fireEvent.change(autocompleteInput, { target: { value: 'c-3' } })

    expect(mockCreate).toHaveBeenCalledWith({ card_id: 'c-3' })
  })

  it('Cmd+Enter on edit note textarea submits', () => {
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]!)
    const textarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Updated note' } })
    mockUpdate.mockClear()
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('Ctrl+Enter on edit note textarea submits', () => {
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]!)
    const textarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Updated note' } })
    mockUpdate.mockClear()
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('plain Enter on edit note textarea does not submit', () => {
    render(<CardsManager initialData={makeCardsPage(initialCards)} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]!)
    const textarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Updated note' } })
    mockUpdate.mockClear()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
