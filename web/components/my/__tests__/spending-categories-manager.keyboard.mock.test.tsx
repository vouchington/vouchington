import React from 'react'
import { describe, vi } from 'vitest'
import { render } from '@testing-library/react'
import { registerManagerKeyboardTests } from '@/test-helpers/components/my/manager-keyboard-submit'
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
    spending_category_topic_id: 'cat-1',
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
  registerManagerKeyboardTests({
    renderManager: () => render(<SpendingCategoriesManager initialData={makeInitialData()} />),
    prepareMocks: () => {
      mockCreate.mockResolvedValue({
        spending_category: {
          id: 'sc-2',
          spending_category_topic_id: 'cat-2',
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
    },
    autocompleteValue: 'cat-2',
    valueLabel: 'Amount',
    addValue: '200',
    editValue: '180',
    onCreate: mockCreate,
    onUpdate: mockUpdate,
  })
})
