import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface HeaderBag {
  get: (key: string) => string | null
}

const { mockGetList, mockGetListItems, mockGetCurrentUser, mockNotFound, mockHeaders } = vi.hoisted(
  () => ({
    mockGetList: vi.fn<VitestLooseMock>(),
    mockGetListItems: vi.fn<VitestLooseMock>(),
    mockGetCurrentUser: vi.fn<VitestLooseMock>(),
    mockNotFound: vi.fn<() => never>(),
    mockHeaders: vi.fn<() => Promise<HeaderBag>>(),
  }),
)

vi.mock(import('@/lib/api/server/lists'), () => ({
  getList: mockGetList,
  getListItems: mockGetListItems,
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(
  import('next/headers'),
  () => ({ headers: mockHeaders }) as unknown as typeof import('next/headers'),
)
vi.mock(import('next/navigation'), () => ({ notFound: mockNotFound }))
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _p,
        ...props
      }: {
        children: React.ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)
vi.mock(import('@/components/lists/list-item-row'), () => ({
  ListItemRow: ({ item }: { item: { id: string; entity_id: string } }) => (
    <div data-pw='list-item-row'>{item.entity_id}</div>
  ),
}))
vi.mock(import('./list-page-actions'), () => ({
  ListPageActions: () => <div data-testid='list-page-actions' />,
}))

import ListPage, { generateMetadata } from './page'

const makeList = (overrides = {}) => ({
  __entity_type: 'list' as const,
  id: 'list-1',
  owner_user_id: 'user-1',
  name: 'My Reading List',
  description: null,
  visibility: 'private' as const,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  removed_at: null,
  ...overrides,
})

const emptyItemsResponse = { results: [], list_items: {}, page_info: { has_next_page: false } }

describe('ListPage', () => {
  beforeEach(() => {
    mockGetList.mockReset()
    mockGetListItems.mockReset()
    mockGetCurrentUser.mockReset()
    mockNotFound.mockReset()
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
    mockGetCurrentUser.mockResolvedValue(null)
    mockHeaders.mockResolvedValue({ get: () => null })
  })

  it('calls notFound when list does not exist', async () => {
    mockGetList.mockResolvedValue(null)
    await expect(ListPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('renders the list name', async () => {
    mockGetList.mockResolvedValue({ list: makeList() })
    mockGetListItems.mockResolvedValue(emptyItemsResponse)
    render(await ListPage({ params: Promise.resolve({ id: 'list-1' }) }))
    const heading = document.querySelector('[data-pw="list-name"]')
    expect(heading?.textContent).toContain('My Reading List')
  })

  it('shows empty state when list has no items', async () => {
    mockGetList.mockResolvedValue({ list: makeList() })
    mockGetListItems.mockResolvedValue(emptyItemsResponse)
    render(await ListPage({ params: Promise.resolve({ id: 'list-1' }) }))
    expect(document.querySelector('[data-pw="list-empty"]')).not.toBeNull()
  })

  it('renders list items using ListItemRow', async () => {
    mockGetList.mockResolvedValue({ list: makeList() })
    mockGetListItems.mockResolvedValue({
      results: [{ __entity_type: 'list_item', id: 'item-1' }],
      list_items: {
        'item-1': {
          __entity_type: 'list_item',
          id: 'item-1',
          list_id: 'list-1',
          item_type: 'rss_feed_item',
          entity_id: 'feed-item-1',
          order_index: 0,
          created_at: '2025-01-01T00:00:00Z',
          media_type: 'article',
        },
      },
      page_info: { has_next_page: false },
    })
    render(await ListPage({ params: Promise.resolve({ id: 'list-1' }) }))
    expect(document.querySelector('[data-pw="list-item-row"]')).not.toBeNull()
  })

  it('renders tabs navigation', async () => {
    mockGetList.mockResolvedValue({ list: makeList() })
    mockGetListItems.mockResolvedValue(emptyItemsResponse)
    render(await ListPage({ params: Promise.resolve({ id: 'list-1' }) }))
    expect(document.querySelector('[data-pw="list-tabs"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="list-tab-all"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="list-tab-reading"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="list-tab-watch"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="list-tab-listen"]')).not.toBeNull()
  })

  it('passes media_type filter for reading tab', async () => {
    mockGetList.mockResolvedValue({ list: makeList() })
    mockGetListItems.mockResolvedValue(emptyItemsResponse)
    await ListPage({
      params: Promise.resolve({ id: 'list-1' }),
      searchParams: Promise.resolve({ tab: 'reading' }),
    })
    expect(mockGetListItems).toHaveBeenCalledWith(
      'list-1',
      expect.objectContaining({ searchParams: expect.objectContaining({ media_type: 'article' }) }),
    )
  })

  it('shows load-more when has_next_page', async () => {
    mockGetList.mockResolvedValue({ list: makeList() })
    mockGetListItems.mockResolvedValue({
      results: [],
      list_items: {},
      page_info: { has_next_page: true, end_cursor: 'cursor-123' },
    })
    render(await ListPage({ params: Promise.resolve({ id: 'list-1' }) }))
    expect(screen.getByRole('button', { name: 'Load more' })).toBeVisible()
  })

  it('shows actions for list owner', async () => {
    mockGetList.mockResolvedValue({ list: makeList({ owner_user_id: 'user-1' }) })
    mockGetListItems.mockResolvedValue(emptyItemsResponse)
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' })
    render(await ListPage({ params: Promise.resolve({ id: 'list-1' }) }))
    expect(screen.getByTestId('list-page-actions')).toBeTruthy()
  })

  it('hides actions for non-owner', async () => {
    mockGetList.mockResolvedValue({ list: makeList({ owner_user_id: 'user-1' }) })
    mockGetListItems.mockResolvedValue(emptyItemsResponse)
    mockGetCurrentUser.mockResolvedValue({ id: 'other-user' })
    render(await ListPage({ params: Promise.resolve({ id: 'list-1' }) }))
    expect(screen.queryByTestId('list-page-actions')).toBeNull()
  })
})

describe('generateMetadata', () => {
  it('returns empty object when list not found', async () => {
    mockGetList.mockResolvedValue(null)
    const metadata = await generateMetadata({ params: Promise.resolve({ id: 'missing' }) })
    expect(metadata).toEqual({})
  })

  it('returns list name as title with OG metadata', async () => {
    mockGetList.mockResolvedValue({
      list: makeList({ name: 'Test List', description: 'A description' }),
    })
    const metadata = await generateMetadata({ params: Promise.resolve({ id: 'list-1' }) })
    expect(metadata.title).toBe('Test List')
    expect(metadata.openGraph).toBeDefined()
  })
})
