import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ListsSidebarGroup } from '../lists-sidebar-group'
import { SidebarContent, SidebarProvider } from '@/components/ui/sidebar'
import type { List, ListsSearchResponseBody } from '@/types/api-responses'
import type { ReactNode } from 'react'

let mockPathname = '/my/lists'

const mockSearchMyLists = vi.fn<() => Promise<ListsSearchResponseBody>>()

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
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

vi.mock(import('@/lib/api/client/lists'), () => ({
  searchMyLists: () => mockSearchMyLists(),
}))

function makeList(overrides: Partial<List> = {}): List {
  return {
    __entity_type: 'list',
    id: 'list-1',
    owner_user_id: 'user-1',
    name: 'My Reading List',
    description: null,
    visibility: 'private',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    removed_at: null,
    ...overrides,
  }
}

function makeSearchResponse(lists: List[]): ListsSearchResponseBody {
  return {
    results: lists.map(l => ({ __entity_type: 'list' as const, id: l.id })),
    lists: Object.fromEntries(lists.map(l => [l.id, l])),
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

function renderGroup() {
  return render(
    <SidebarProvider>
      <SidebarContent>
        <ListsSidebarGroup />
      </SidebarContent>
    </SidebarProvider>,
  )
}

describe('ListsSidebarGroup', () => {
  beforeEach(() => {
    mockPathname = '/my/lists'
    mockSearchMyLists.mockResolvedValue(makeSearchResponse([makeList()]))
  })

  it('renders the My Lists header link', async () => {
    renderGroup()
    const myListsLink = await screen.findByRole('link', { name: /my lists/i })
    expect(myListsLink).toBeDefined()
    expect(myListsLink.getAttribute('href')).toBe('/my/lists')
  })

  it('renders list items returned by the fetch', async () => {
    mockSearchMyLists.mockResolvedValue(
      makeSearchResponse([
        makeList({ id: 'list-a', name: 'Tech Articles' }),
        makeList({ id: 'list-b', name: 'Weekend Reads' }),
      ]),
    )
    renderGroup()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /tech articles/i })).toBeDefined()
      expect(screen.getByRole('link', { name: /weekend reads/i })).toBeDefined()
    })
  })

  it('prepends a new list to the sidebar when lists:created event fires', async () => {
    renderGroup()
    await screen.findByRole('link', { name: /my reading list/i })

    const newList = makeList({ id: 'list-new', name: 'Newly Created List' })
    window.dispatchEvent(new CustomEvent('lists:created', { detail: newList }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /newly created list/i })).toBeDefined()
    })
  })

  it('preserves a created list when the initial fetch resolves after the event', async () => {
    let resolveSearch!: (value: ListsSearchResponseBody) => void
    mockSearchMyLists.mockReturnValue(
      new Promise(resolve => {
        resolveSearch = resolve
      }),
    )

    renderGroup()

    const newList = makeList({ id: 'list-new', name: 'Newly Created List' })
    window.dispatchEvent(new CustomEvent('lists:created', { detail: newList }))

    const existingList = makeList({ id: 'list-existing', name: 'Existing List' })
    resolveSearch(makeSearchResponse([existingList]))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /newly created list/i })).toBeDefined()
      expect(screen.getByRole('link', { name: /existing list/i })).toBeDefined()
    })
  })
})
