/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import {
  isValidElement,
  type JSXElementConstructor,
  type ReactElement,
  type ReactNode,
} from 'react'
import { vi } from 'vitest'
import { Input } from '@/components/ui/input'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import type { SpendingCategory } from '@/types/my'

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error/on-success'), () => ({
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/components/posts/topic-autocomplete'),
  () =>
    ({
      TopicAutocomplete: ({
        value,
        onChange,
        placeholder,
      }: {
        value?: string | null
        onChange?: (id: string, name: string) => void
        placeholder?: string
      }) => (
        <div data-testid='mock-topic-autocomplete'>
          <Input
            type='text'
            placeholder={placeholder}
            aria-label={placeholder ?? 'Spending category'}
            value={value ?? ''}
            onChange={event => onChange?.(event.target.value, 'Mocked Topic')}
            data-testid='mock-topic-autocomplete-input'
          />
        </div>
      ),
    }) as unknown as typeof import('@/components/posts/topic-autocomplete'),
)

vi.mock(import('@/components/ui/select'), () => {
  const triggerMock = (_props: { id?: string; children?: ReactNode }) => null
  const contentMock = ({ children }: { children?: ReactNode }) => children

  function isSelectElement<Props>(
    child: ReactNode,
    type: JSXElementConstructor<Props>,
  ): child is ReactElement<Props> {
    return isValidElement<Props>(child) && child.type === type
  }

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      children?: ReactNode
    }) => {
      const childArray = children == null ? [] : Array.isArray(children) ? children : [children]
      const trigger = childArray.find(child => isSelectElement(child, triggerMock))
      const content = childArray.find(child => isSelectElement(child, contentMock))

      return (
        // ast-grep-ignore: web-no-raw-form-elements -- test mock replaces UI Select with native select semantics so tests can drive it with change events
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
    SelectTrigger: triggerMock,
    SelectValue: () => null,
    SelectContent: contentMock,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  } as unknown as typeof import('@/components/ui/select')
})

vi.mock(import('@/lib/api/client'), () => ({
  createMySpendingCategory: vi.fn<VitestLooseMock>(),
  updateMySpendingCategory: vi.fn<VitestLooseMock>(),
  deleteMySpendingCategory: vi.fn<VitestLooseMock>(),
}))

import {
  createMySpendingCategory,
  deleteMySpendingCategory,
  updateMySpendingCategory,
} from '@/lib/api/client'
import onError from '@/lib/on-error'
import { onSuccess } from '@/lib/on-error/on-success'

export const mockCreate = vi.mocked(createMySpendingCategory)
export const mockUpdate = vi.mocked(updateMySpendingCategory)
export const mockDelete = vi.mocked(deleteMySpendingCategory)
export const mockOnError = vi.mocked(onError)
export const mockOnSuccess = vi.mocked(onSuccess)

export const initialCategories: SpendingCategory[] = [
  {
    id: 'sc-1',
    spending_category_topic_id: 'cat-1',
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

export function makeInitialData() {
  return {
    results: initialCategories,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}
