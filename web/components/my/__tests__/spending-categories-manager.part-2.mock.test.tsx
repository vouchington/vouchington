import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

import { SpendingCategoriesManager } from '../spending-categories-manager'

import type { SpendingCategory } from '@/types/my'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import { seedMessages } from '@/lib/i18n/use-translations'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'

// Mock on-error helpers
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error/on-success'), () => ({
  onSuccess: vi.fn<VitestLooseMock>(),
}))

// Mock Next.js router
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: vi.fn<VitestLooseMock>(),
        refresh: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

// Mock autocomplete components
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

// Mock client API calls
vi.mock(import('@/lib/api/client'), () => ({
  createMySpendingCategory: vi.fn<VitestLooseMock>(),
  updateMySpendingCategory: vi.fn<VitestLooseMock>(),
  deleteMySpendingCategory: vi.fn<VitestLooseMock>(),
}))

import {
  createMySpendingCategory,
  updateMySpendingCategory,
  deleteMySpendingCategory,
} from '@/lib/api/client'

import { onSuccess } from '@/lib/on-error/on-success'

const mockCreate = vi.mocked(createMySpendingCategory)

const mockUpdate = vi.mocked(updateMySpendingCategory)

const mockDelete = vi.mocked(deleteMySpendingCategory)

const mockOnSuccess = vi.mocked(onSuccess)

const initialCategories: SpendingCategory[] = [
  {
    id: 'sc-1',
    spending_category_id: 'cat-1',
    amount: { amount: 15_000, currency: 'usd' },
    spending_frequency: 'monthly',
    note: 'Initial coffee expense',
    spending_category: {
      id: 'cat-1',
      name: 'Coffee',
      slug: 'coffee',
    },
  },
]

function makeInitialData() {
  return {
    results: initialCategories,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

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
