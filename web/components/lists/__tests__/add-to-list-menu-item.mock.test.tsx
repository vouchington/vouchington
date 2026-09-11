import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import type { ReactNode } from 'react'

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    List: () => <svg data-testid='list-icon' />,
    X: () => <svg data-testid='x-icon' />,
    Check: () => <svg data-testid='check-icon' />,
  }),
)

const { mockGetListsContaining, mockSearchMyLists, mockAddListRssFeedItem, mockAddListPost } =
  vi.hoisted(() => ({
    mockGetListsContaining: vi.fn<VitestLooseMock>(),
    mockSearchMyLists: vi.fn<VitestLooseMock>(),
    mockAddListRssFeedItem: vi.fn<VitestLooseMock>(),
    mockAddListPost: vi.fn<VitestLooseMock>(),
  }))

vi.mock(import('@/lib/api/client/lists'), () => ({
  getListsContaining: mockGetListsContaining,
  searchMyLists: mockSearchMyLists,
  addListRssFeedItem: mockAddListRssFeedItem,
  addListPost: mockAddListPost,
  removeListRssFeedItem: vi.fn<VitestLooseMock>(),
  removeListPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenuItem: ({
        children,
        onSelect,
        ...props
      }: {
        children: ReactNode
        onSelect?: (e: Event) => void
        [k: string]: unknown
      }) => (
        <button
          type='button'
          onClick={() => onSelect?.(new Event('select'))}
          data-testid='dropdown-menu-item'
          {...props}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

vi.mock(
  import('@/components/ui/dialog'),
  () =>
    ({
      Dialog: ({
        open,
        children,
      }: {
        open: boolean
        children: ReactNode
        onOpenChange?: (open: boolean) => void
      }) => (open ? <div data-testid='dialog'>{children}</div> : null),
      DialogContent: ({ children, ...props }: { children: ReactNode; [k: string]: unknown }) => (
        <div
          data-testid='dialog-content'
          {...props}
        >
          {children}
        </div>
      ),
      DialogDescription: ({ children, className }: { children: ReactNode; className?: string }) => (
        <p className={className}>{children}</p>
      ),
      DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    }) as unknown as typeof import('@/components/ui/dialog'),
)

vi.mock(
  import('@/components/ui/checkbox'),
  () =>
    ({
      Checkbox: ({
        id,
        checked,
        disabled,
        onCheckedChange,
      }: {
        id?: string
        checked?: boolean
        disabled?: boolean
        onCheckedChange?: (v: boolean) => void
      }) => (
        <input
          type='checkbox'
          id={id}
          checked={checked}
          disabled={disabled}
          onChange={e => onCheckedChange?.(e.target.checked)}
        />
      ),
    }) as unknown as typeof import('@/components/ui/checkbox'),
)

vi.mock(
  import('sonner'),
  () => ({ toast: { error: vi.fn<VitestLooseMock>() } }) as unknown as typeof import('sonner'),
)

import { AddToListMenuItem } from '../add-to-list-menu-item'

const emptyContaining = { list_ids: [] }
const oneList = {
  results: [{ __entity_type: 'list' as const, id: 'list-1' }],
  lists: {
    'list-1': {
      __entity_type: 'list' as const,
      id: 'list-1',
      owner_user_id: 'user-1',
      name: 'Favourites',
      description: null,
      visibility: 'private' as const,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      removed_at: null,
    },
  },
  page_info: { has_next_page: false },
}

describe('AddToListMenuItem', () => {
  beforeEach(() => {
    mockGetListsContaining.mockReset()
    mockSearchMyLists.mockReset()
    mockAddListRssFeedItem.mockReset()
    mockAddListPost.mockReset()
    mockGetListsContaining.mockResolvedValue(emptyContaining)
    mockSearchMyLists.mockResolvedValue({
      results: [],
      lists: {},
      page_info: { has_next_page: false },
    })
  })

  it('renders the menu item with data-pw', () => {
    render(
      <AddToListMenuItem
        itemType='rss_feed_item'
        entityId='item-1'
      />,
    )
    expect(document.querySelector('[data-pw="add-to-list-menu-item"]')).not.toBeNull()
  })

  it('opens dialog on click', async () => {
    render(
      <AddToListMenuItem
        itemType='rss_feed_item'
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByTestId('dropdown-menu-item'))
    expect(screen.getByTestId('dialog')).toBeTruthy()
    expect(document.querySelector('[data-pw="add-to-list-dialog"]')).not.toBeNull()
  })

  it('renders a screen-reader description for the dialog - post', async () => {
    render(
      <AddToListMenuItem
        itemType='post'
        entityId='post-1'
      />,
    )
    fireEvent.click(screen.getByTestId('dropdown-menu-item'))
    expect(screen.getByText('Choose which of your lists include this post.')).toHaveClass('sr-only')
  })

  it('renders a screen-reader description for the dialog - feed item', async () => {
    render(
      <AddToListMenuItem
        itemType='rss_feed_item'
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByTestId('dropdown-menu-item'))
    expect(screen.getByText('Choose which of your lists include this feed item.')).toHaveClass(
      'sr-only',
    )
  })

  it('shows list names with checkboxes after loading', async () => {
    mockSearchMyLists.mockResolvedValue(oneList)
    mockGetListsContaining.mockResolvedValue({ list_ids: [] })
    render(
      <AddToListMenuItem
        itemType='rss_feed_item'
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByTestId('dropdown-menu-item'))
    await waitFor(() => screen.getByText('Favourites'))
    expect(screen.getByLabelText('Favourites')).not.toBeNull()
  })

  it('renders checked state for lists that already contain the item', async () => {
    mockSearchMyLists.mockResolvedValue(oneList)
    mockGetListsContaining.mockResolvedValue({ list_ids: ['list-1'] })
    render(
      <AddToListMenuItem
        itemType='rss_feed_item'
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByTestId('dropdown-menu-item'))
    await waitFor(() => screen.getByText('Favourites'))
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('calls addListRssFeedItem when checking a list', async () => {
    mockSearchMyLists.mockResolvedValue(oneList)
    mockGetListsContaining.mockResolvedValue({ list_ids: [] })
    mockAddListRssFeedItem.mockResolvedValue(undefined)
    render(
      <AddToListMenuItem
        itemType='rss_feed_item'
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByTestId('dropdown-menu-item'))
    await waitFor(() => screen.getByText('Favourites'))
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(mockAddListRssFeedItem).toHaveBeenCalledWith('list-1', 'item-1'))
  })

  it('calls addListPost for post item type', async () => {
    mockSearchMyLists.mockResolvedValue(oneList)
    mockGetListsContaining.mockResolvedValue({ list_ids: [] })
    mockAddListPost.mockResolvedValue(undefined)
    render(
      <AddToListMenuItem
        itemType='post'
        entityId='post-1'
      />,
    )
    fireEvent.click(screen.getByTestId('dropdown-menu-item'))
    await waitFor(() => screen.getByText('Favourites'))
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(mockAddListPost).toHaveBeenCalledWith('list-1', 'post-1'))
  })

  it('shows empty state when user has no lists', async () => {
    render(
      <AddToListMenuItem
        itemType='rss_feed_item'
        entityId='item-1'
      />,
    )
    fireEvent.click(screen.getByTestId('dropdown-menu-item'))
    await waitFor(() => expect(screen.getByText(/no lists yet/i)).toBeTruthy())
  })
})
