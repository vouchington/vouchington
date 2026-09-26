/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import React from 'react'
import { vi } from 'vitest'

import { CardsManager } from '@/components/my/cards-manager'
import { createMyCard, deleteMyCard, updateMyCard } from '@/lib/api/client'
import { initialCards } from '@/test-helpers/cards-manager-test-data'

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
    info: vi.fn<VitestLooseMock>(),
  }),
}))

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

// Render the select UI as a plain <select> so tests drive it with change events
vi.mock(import('@/components/ui/select'), () => {
  const triggerMock = (_props: { id?: string; children?: React.ReactNode }) => null
  const contentMock = ({ children }: { children?: React.ReactNode }) => children

  function isSelectElement<Props>(
    child: React.ReactNode,
    type: React.JSXElementConstructor<Props>,
  ): child is React.ReactElement<Props> {
    return React.isValidElement<Props>(child) && child.type === type
  }

  return {
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
      const trigger = childArray.find(child => isSelectElement(child, triggerMock))
      const content = childArray.find(child => isSelectElement(child, contentMock))

      return (
        <select
          id={trigger?.props.id}
          value={value}
          aria-label='Card issuer'
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
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  } as unknown as typeof import('@/components/ui/select')
})

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

export { toastMock }
export const mockCreate = vi.mocked(createMyCard)
export const mockUpdate = vi.mocked(updateMyCard)
export const mockDelete = vi.mocked(deleteMyCard)

export function setUpCardsManagerTest() {
  vi.clearAllMocks()
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
      authorized_user_of_card: null,
    },
  })
  mockUpdate.mockResolvedValue({
    card: {
      ...initialCards[0]!,
      closed_on: '2025-01-01',
      received_sign_up_bonus_on: '2023-04-01',
      credit_limit: { amount: 1_200_000, currency: 'usd' },
      note: 'Updated Note',
    },
  })
  mockDelete.mockResolvedValue(undefined)
}

export async function loadCardsManager() {
  return CardsManager
}
