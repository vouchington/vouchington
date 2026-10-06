import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireCurrentUser, mockGetMyLists } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetMyLists: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: mockRequireCurrentUser,
}))
vi.mock(import('@/lib/api/server/lists'), () => ({
  getMyLists: mockGetMyLists,
}))
vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: React.ReactNode
        href: string
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

import MyListsPage from './page'

const baseUser = { id: 'user-1', username: 'alice' }
const emptyListsResponse = { results: [], lists: {}, page_info: { has_next_page: false } }

describe('MyListsPage', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockReset()
    mockGetMyLists.mockReset()
  })

  it('calls requireCurrentUser', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    mockGetMyLists.mockResolvedValue(emptyListsResponse)
    await MyListsPage()
    expect(mockRequireCurrentUser).toHaveBeenCalled()
  })

  it('renders my-lists-page container', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    mockGetMyLists.mockResolvedValue(emptyListsResponse)
    const { container } = render(await MyListsPage())
    expect(container.querySelector('[data-pw="my-lists-page"]')).toBeTruthy()
  })

  it('shows empty state when no lists', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    mockGetMyLists.mockResolvedValue(emptyListsResponse)
    render(await MyListsPage())
    expect(screen.getByText(/you have no lists yet/i)).toBeDefined()
  })

  it('renders list items when lists exist', async () => {
    mockRequireCurrentUser.mockResolvedValue(baseUser)
    mockGetMyLists.mockResolvedValue({
      results: [{ __entity_type: 'list', id: 'list-1' }],
      lists: {
        'list-1': {
          __entity_type: 'list',
          id: 'list-1',
          owner_user_id: 'user-1',
          name: 'My Reading List',
          description: null,
          visibility: 'private',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          removed_at: null,
        },
      },
      page_info: { has_next_page: false },
    })
    render(await MyListsPage())
    const item = document.querySelector('[data-pw="my-list-item"]')
    expect(item).toBeTruthy()
    expect(item?.textContent).toContain('My Reading List')
  })

  describe('provenance', () => {
    const makeList = (extra: Record<string, unknown>) => ({
      __entity_type: 'list',
      id: 'list-1',
      owner_user_id: 'user-1',
      name: 'My Reading List',
      description: null,
      visibility: 'private',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      removed_at: null,
      ...extra,
    })
    const mockLists = (extra: Record<string, unknown>) =>
      mockGetMyLists.mockResolvedValue({
        results: [{ __entity_type: 'list', id: 'list-1' }],
        lists: { 'list-1': makeList(extra) },
        page_info: { has_next_page: false },
      })
    const rowQuery = (id: string) =>
      document.querySelector('[data-pw="my-list-row"]')?.querySelector(`[data-pw="${id}"]`)

    beforeEach(() => {
      mockRequireCurrentUser.mockResolvedValue(baseUser)
    })

    it('shows the public label on the row', async () => {
      mockLists({ provenance: { via: 'api', app: null } })
      render(await MyListsPage())
      expect(rowQuery('list-provenance-badge')?.textContent).toBe('via API')
    })

    it('shows the staff channel but not the client on the row', async () => {
      mockLists({
        provenance: { via: 'mcp', app: null },
        staff_provenance: {
          created_via: 'mcp',
          oauth_client: {
            client_id: 'voucha_fixture_agent',
            client_name: 'Fixture Agent',
            metadata_url: null,
            verified: true,
          },
        },
      })
      render(await MyListsPage())
      expect(rowQuery('list-provenance-channel')?.textContent).toBe('Channel: mcp')
      expect(rowQuery('list-provenance-client')).toBeFalsy()
    })

    it('shows nothing for a list created on the web', async () => {
      mockLists({})
      render(await MyListsPage())
      expect(rowQuery('list-provenance-badge')).toBeFalsy()
      expect(rowQuery('list-provenance-channel')).toBeFalsy()
    })
  })
})
