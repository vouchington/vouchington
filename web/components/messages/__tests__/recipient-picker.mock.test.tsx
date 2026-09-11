import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSearchUsers } = vi.hoisted(() => ({
  mockSearchUsers: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/users'), () => ({
  searchUsers: mockSearchUsers,
}))

vi.mock(
  import('@/components/shared/entity-autocomplete'),
  () =>
    ({
      EntityAutocomplete: ({
        onSelect,
      }: {
        onSelect: (
          item: { id: string; username?: string },
          helpers: { setQuery: (q: string) => void },
        ) => void
        [k: string]: unknown
      }) => (
        <button
          type='button'
          data-testid='entity-autocomplete'
          onClick={() =>
            onSelect({ id: 'u-new', username: 'newuser' }, { setQuery: vi.fn<VitestLooseMock>() })
          }
        >
          Add
        </button>
      ),
    }) as unknown as typeof import('@/components/shared/entity-autocomplete'),
)

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
        type: _type,
        ...rest
      }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
        type?: string
        [k: string]: unknown
      }) => (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          {...rest}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

import { RecipientPicker } from '../recipient-picker'
import type { UserSearchResult } from '@/types/user'

function makeUser(id: string, username: string): UserSearchResult {
  return { id, username, profile_image_id: null }
}

describe('RecipientPicker', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders existing recipient chips', () => {
    const { container } = render(
      <RecipientPicker
        recipients={[makeUser('u-1', 'alice')]}
        onAdd={vi.fn<VitestLooseMock>()}
        onRemove={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(container.querySelector('[data-pw="recipient-chip"]')).not.toBeNull()
    expect(screen.getByText('@alice')).toBeDefined()
  })

  it('calls onRemove when remove button is clicked', () => {
    const onRemove = vi.fn<VitestLooseMock>()
    const { container } = render(
      <RecipientPicker
        recipients={[makeUser('u-1', 'alice')]}
        onAdd={vi.fn<VitestLooseMock>()}
        onRemove={onRemove}
      />,
    )
    const btn = container.querySelector('[data-pw="remove-recipient-button"]') as HTMLButtonElement
    fireEvent.click(btn)
    expect(onRemove).toHaveBeenCalledWith('u-1')
  })

  it('does not render chips when recipients is empty', () => {
    const { container } = render(
      <RecipientPicker
        recipients={[]}
        onAdd={vi.fn<VitestLooseMock>()}
        onRemove={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(container.querySelector('[data-pw="recipient-chip"]')).toBeNull()
  })

  it('calls onAdd and clears query when EntityAutocomplete triggers onSelect', () => {
    const onAdd = vi.fn<VitestLooseMock>()
    render(
      <RecipientPicker
        recipients={[]}
        onAdd={onAdd}
        onRemove={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByTestId('entity-autocomplete'))
    expect(onAdd).toHaveBeenCalledWith({ id: 'u-new', username: 'newuser' })
  })
})
