import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

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

// Mock autocomplete components
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
            aria-label='Card issuer'
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

// Mock Checkbox
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

// Mock client API calls
vi.mock(import('@/lib/api/client'), () => ({
  createMyCard: vi.fn<VitestLooseMock>(),
  updateMyCard: vi.fn<VitestLooseMock>(),
  deleteMyCard: vi.fn<VitestLooseMock>(),
}))

import { createMyCard, updateMyCard, deleteMyCard } from '@/lib/api/client'

const mockCreate = vi.mocked(createMyCard)

const mockUpdate = vi.mocked(updateMyCard)

const mockDelete = vi.mocked(deleteMyCard)

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
  {
    id: 'card-owner-2',
    card_id: 'c-2',
    opened_on: '2024-02-02',
    closed_on: null,
    received_sign_up_bonus_on: null,
    credit_limit: { amount: 500_000, currency: 'usd' },
    is_authorized_user: true,
    authorized_user_of_id: 'card-owner-1',
    note: 'Authorized User Note',
    authorized_user_of_card: null,
    card: {
      id: 'c-2',
      name: 'Chase Freedom Flex',
      slug: 'cff',
    },
  },
]

describe('CardsManager Integration Flow', () => {
  beforeEach(() => {
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
        card: {
          id: 'c-3',
          name: 'Amex Gold',
          slug: 'amex-gold',
        },
      },
    } as any)
    mockUpdate.mockResolvedValue({
      card: {
        id: 'card-owner-1',
        card_id: 'c-1',
        opened_on: '2023-01-01',
        closed_on: '2025-01-01',
        received_sign_up_bonus_on: '2023-04-01',
        credit_limit: { amount: 1_200_000, currency: 'usd' },
        is_authorized_user: false,
        authorized_user_of_id: null,
        note: 'Updated Note',
        card: {
          id: 'c-1',
          name: 'Chase Sapphire Preferred',
          slug: 'csp',
        },
      },
    } as any)
    mockDelete.mockResolvedValue(undefined as any)
  })

  it('successfully creates a new card via autocomplete selection', async () => {
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
})
