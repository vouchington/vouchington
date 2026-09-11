import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

import { SpendingCategoriesManager } from '../spending-categories-manager'

import type { SpendingCategory } from '@/types/my'

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

import { ApiError } from '@/lib/api/error'

import onError from '@/lib/on-error'

import { onSuccess } from '@/lib/on-error/on-success'

const mockCreate = vi.mocked(createMySpendingCategory)

const mockUpdate = vi.mocked(updateMySpendingCategory)

const mockDelete = vi.mocked(deleteMySpendingCategory)

const mockOnError = vi.mocked(onError)

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
