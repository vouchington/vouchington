import { describe, it, expect, vi, afterEach } from 'vitest'
import { createContext, use } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UserAutocomplete } from '../user-autocomplete'

// Mock Popover components to avoid portal/DOM issues in tests.
// Context is created inside the factory so it's available when the factory runs
// (vi.mock is hoisted before module-level declarations).
// PopoverContent reads open state from context so visibility is correct
// regardless of component render order.
vi.mock(import('@/components/ui/popover'), () => {
  const PopoverContext = createContext(false)
  return {
    Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <PopoverContext.Provider value={!!open}>{children}</PopoverContext.Provider>
    ),
    PopoverAnchor: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const open = use(PopoverContext)
      return open ? <div>{children}</div> : null
    },
  } as unknown as typeof import('@/components/ui/popover')
})

// Mock cmdk-based Command components to avoid ResizeObserver dependency
vi.mock(
  import('@/components/ui/command'),
  () =>
    ({
      Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      CommandInput: ({
        placeholder,
        value,
        onValueChange,
        onFocus,
        onKeyDown,
      }: {
        placeholder?: string
        value?: string
        onValueChange?: (v: string) => void
        onFocus?: () => void
        onKeyDown?: (e: React.KeyboardEvent) => void
      }) => (
        <input
          placeholder={placeholder}
          aria-label={placeholder ?? 'Command search'}
          value={value}
          onChange={e => onValueChange?.(e.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        />
      ),
      CommandList: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
      CommandEmpty: ({ children }: { children: React.ReactNode }) => (
        <li data-testid='command-empty'>{children}</li>
      ),
      CommandItem: ({
        children,
        onSelect,
      }: {
        children: React.ReactNode
        onSelect?: () => void
      }) => (
        <li>
          <button
            type='button'
            onClick={onSelect}
          >
            {children}
          </button>
        </li>
      ),
    }) as unknown as typeof import('@/components/ui/command'),
)

vi.mock(import('@/lib/api/client/users'), () => ({
  searchUsers: vi.fn<VitestLooseMock>().mockResolvedValue({
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }),
}))

import { searchUsers } from '@/lib/api/client/users'

const mockSearchUsers = vi.mocked(searchUsers)

describe('UserAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    render(
      <UserAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search users...')).toBeDefined()
  })

  it('shows provided label as initial value', () => {
    render(
      <UserAutocomplete
        value='user-1'
        label='alice'
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search users...') as HTMLInputElement
    expect(input.value).toBe('alice')
  })

  it('opens dropdown and shows empty state on input change', () => {
    render(
      <UserAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search users...')
    fireEvent.change(input, { target: { value: 'ali' } })
    expect(screen.getByTestId('command-empty')).toBeDefined()
  })

  it('shows user results after fetch', async () => {
    mockSearchUsers.mockResolvedValueOnce({
      results: [
        {
          __entity_type: 'user',
          id: 'user-1',
          username: 'alice',
          display_account: null,
          created_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          roles: [],
        } as never,
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    render(
      <UserAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search users...')
    fireEvent.change(input, { target: { value: 'ali' } })

    await waitFor(
      () => {
        expect(screen.getByText('alice')).toBeDefined()
      },
      { timeout: 500 },
    )
  })

  it('calls onChange when a user is selected', async () => {
    mockSearchUsers.mockResolvedValueOnce({
      results: [
        {
          __entity_type: 'user',
          id: 'user-1',
          username: 'alice',
          display_account: null,
          created_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          roles: [],
        } as never,
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    const onUserSelect = vi.fn<VitestLooseMock>()
    render(
      <UserAutocomplete
        value={null}
        label=''
        onChange={onUserSelect}
      />,
    )
    const input = screen.getByPlaceholderText('Search users...')
    fireEvent.change(input, { target: { value: 'ali' } })

    await waitFor(
      () => {
        expect(screen.getByText('alice')).toBeDefined()
      },
      { timeout: 500 },
    )

    fireEvent.click(screen.getByText('alice'))
    expect(onUserSelect).toHaveBeenCalledWith('user-1', 'alice')
  })

  it('clears the stored id when text is edited and clearOnTextEdit + a value are set', () => {
    const onUserSelect = vi.fn<VitestLooseMock>()
    render(
      <UserAutocomplete
        value='user-1'
        label='alice'
        onChange={onUserSelect}
        clearOnTextEdit
      />,
    )
    const input = screen.getByPlaceholderText('Search users...')
    fireEvent.change(input, { target: { value: 'alic' } })
    expect(onUserSelect).toHaveBeenCalledWith('', '')
  })

  it('does not clear on text edit when no value is selected', () => {
    const onUserSelect = vi.fn<VitestLooseMock>()
    render(
      <UserAutocomplete
        value={null}
        label=''
        onChange={onUserSelect}
        clearOnTextEdit
      />,
    )
    const input = screen.getByPlaceholderText('Search users...')
    fireEvent.change(input, { target: { value: 'ali' } })
    expect(onUserSelect).not.toHaveBeenCalled()
  })

  it('does not clear on text edit when clearOnTextEdit is off', () => {
    const onUserSelect = vi.fn<VitestLooseMock>()
    render(
      <UserAutocomplete
        value='user-1'
        label='alice'
        onChange={onUserSelect}
      />,
    )
    const input = screen.getByPlaceholderText('Search users...')
    fireEvent.change(input, { target: { value: 'alic' } })
    expect(onUserSelect).not.toHaveBeenCalled()
  })
})
