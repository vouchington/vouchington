import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { SpendingCategoriesManager } from '../spending-categories-manager'
import type { SpendingCategory } from '@/types/my'

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error/on-success'), () => ({
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({ value, onChange, placeholder }: any) => (
    <div data-testid='mock-topic-autocomplete'>
      <input
        type='text'
        placeholder={placeholder}
        aria-label={placeholder ?? 'Spending category'}
        value={value ?? ''}
        onChange={e => onChange(e.target.value, 'Mocked Topic')}
        data-testid='mock-topic-autocomplete-input'
      />
    </div>
  ),
}))

import React from 'react'

interface MockSelectChildProps {
  children?: React.ReactNode
}

interface MockSelectTriggerProps extends MockSelectChildProps {
  id?: string
}

function MockSelectTrigger(_props: MockSelectTriggerProps) {
  return null
}

function MockSelectContent({ children }: MockSelectChildProps) {
  return children
}

function isMockSelectElement<Props>(
  child: React.ReactNode,
  type: React.JSXElementConstructor<Props>,
): child is React.ReactElement<Props> {
  return React.isValidElement<Props>(child) && child.type === type
}

// Mock select component UI for easy testing as plain select dropdown
vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        value,
        onValueChange,
        children,
      }: {
        value?: string
        onValueChange?: (value: string) => void
        children?: React.ReactNode
      }) => {
        const childArray = children == null ? [] : Array.isArray(children) ? children : [children]
        const trigger = childArray.find(child => isMockSelectElement(child, MockSelectTrigger))
        const content = childArray.find(child => isMockSelectElement(child, MockSelectContent))

        return (
          <select
            id={trigger?.props.id}
            value={value}
            aria-label='Spending category type'
            onChange={event => onValueChange?.(event.target.value)}
            data-testid='mock-select'
          >
            {content?.props.children}
          </select>
        )
      },
      SelectTrigger: MockSelectTrigger,
      SelectValue: () => null,
      SelectContent: MockSelectContent,
      SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
        <option value={value}>{children}</option>
      ),
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('@/lib/api/client'), () => ({
  createMySpendingCategory: vi.fn<VitestLooseMock>(),
  updateMySpendingCategory: vi.fn<VitestLooseMock>(),
  deleteMySpendingCategory: vi.fn<VitestLooseMock>(),
}))

import { createMySpendingCategory, updateMySpendingCategory } from '@/lib/api/client'

const mockCreate = vi.mocked(createMySpendingCategory)
const mockUpdate = vi.mocked(updateMySpendingCategory)

const initialCategories: SpendingCategory[] = [
  {
    id: 'sc-1',
    spending_category_id: 'cat-1',
    amount: { amount: 15_000, currency: 'usd' },
    spending_frequency: 'monthly',
    note: 'Some note',
    spending_category: { id: 'cat-1', name: 'Coffee', slug: 'coffee' },
  },
]

function makeInitialData() {
  return {
    results: initialCategories,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

describe('SpendingCategoriesManager keyboard submit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreate.mockResolvedValue({
      spending_category: {
        id: 'sc-2',
        spending_category_id: 'cat-2',
        amount: { amount: 20_000, currency: 'usd' },
        spending_frequency: 'monthly',
        note: null,
        spending_category: { id: 'cat-2', name: 'Grocery', slug: 'grocery' },
      },
    } as any)
    mockUpdate.mockResolvedValue({
      spending_category: {
        ...initialCategories[0],
        note: 'Updated note',
      },
    } as any)
  })

  it('Enter on the amount input submits the add form', () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    // Select a category to enable submission
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'cat-2' } })

    // Fill in amount
    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement
    fireEvent.change(amountInput, { target: { value: '200' } })

    void expectInputEnterSubmits({ input: amountInput, onSubmit: mockCreate })
  })

  it('Cmd+Enter on add form note textarea submits', () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'cat-2' } })
    const amountInput = screen.getByLabelText('Amount')
    fireEvent.change(amountInput, { target: { value: '200' } })
    const noteTextarea = screen.getByLabelText('Note (optional)') as HTMLTextAreaElement
    mockCreate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter', metaKey: true })
    expect(mockCreate).toHaveBeenCalled()
  })

  it('Ctrl+Enter on add form note textarea submits', () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'cat-2' } })
    const amountInput = screen.getByLabelText('Amount')
    fireEvent.change(amountInput, { target: { value: '200' } })
    const noteTextarea = screen.getByLabelText('Note (optional)') as HTMLTextAreaElement
    mockCreate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter', ctrlKey: true })
    expect(mockCreate).toHaveBeenCalled()
  })

  it('plain Enter on add form note textarea does not submit', () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'cat-2' } })
    const amountInput = screen.getByLabelText('Amount')
    fireEvent.change(amountInput, { target: { value: '200' } })
    const noteTextarea = screen.getByLabelText('Note (optional)') as HTMLTextAreaElement
    mockCreate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('edit form has a submit button wired to the save handler', async () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    // Open edit — both edit and add forms are visible; edit form is first in DOM
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))

    // Change a field so handleSave doesn't early-exit
    const amountInput = screen.getAllByLabelText('Amount')[0] as HTMLInputElement
    fireEvent.change(amountInput, { target: { value: '180' } })

    // Verify the edit form has a type=submit button and form submit calls the API
    const saveButton = screen.getByRole('button', { name: /Save/i })
    expect(saveButton).toHaveAttribute('type', 'submit')
    const editForm = saveButton.closest('form')!
    mockUpdate.mockClear()
    fireEvent.submit(editForm)
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
  })

  it('Cmd+Enter on the edit note textarea submits the edit form', async () => {
    render(<SpendingCategoriesManager initialData={makeInitialData()} />)

    // Open edit
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))

    // Change a field so handleSave doesn't early-exit
    const amountInput = screen.getAllByLabelText('Amount')[0] as HTMLInputElement
    fireEvent.change(amountInput, { target: { value: '180' } })

    const noteTextarea = screen.getByLabelText('Note') as HTMLTextAreaElement

    // Plain Enter on textarea must not submit
    mockUpdate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter' })
    expect(mockUpdate).not.toHaveBeenCalled()

    // Cmd+Enter submits
    mockUpdate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
  })
})
