import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CommunitiesSidebarGroup } from '../communities-sidebar-group'
import { SidebarContent, SidebarProvider } from '@/components/ui/sidebar'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
} from '@/test-helpers/api-responses/communities'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'
import type { ReactNode } from 'react'

let mockPathname = '/communities/voucha-quality-filters/lists/topics'

const mockSearchMyCommunities = vi.fn<() => Promise<CommunitiesSearchResponseBody>>()

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

vi.mock(import('@/lib/api/client/communities'), () => ({
  searchMyCommunities: () => mockSearchMyCommunities(),
}))

function renderGroup() {
  return render(
    <SidebarProvider>
      <SidebarContent>
        <CommunitiesSidebarGroup />
      </SidebarContent>
    </SidebarProvider>,
  )
}

describe('CommunitiesSidebarGroup', () => {
  beforeEach(() => {
    mockPathname = '/communities/voucha-quality-filters/lists/topics'
    const community = makeCommunity({
      id: 'community-1',
      name: 'Voucha Quality Filters With An Extra Long Sidebar Label',
      slug: 'voucha-quality-filters',
      markdown: null,
      list_type: 'follow',
      created_at: '2026-05-03T00:00:00.000Z',
      updated_at: '2026-05-03T00:00:00.000Z',
    })
    mockSearchMyCommunities.mockResolvedValue(
      makeCommunitiesSearchResponse({
        communities: [community],
        communityMetrics: {},
      }),
    )
  })

  it('marks the long active community link as active', async () => {
    renderGroup()

    const longCommunityLink = await screen.findByRole('link', {
      name: /Voucha Quality Filters With An Extra Long Sidebar Label/i,
    })
    expect(longCommunityLink).toHaveAttribute('href', '/communities/voucha-quality-filters')

    await waitFor(() => {
      expect(longCommunityLink.closest('[data-sidebar="menu-button"]')).toHaveAttribute(
        'data-active',
        'true',
      )
    })
  })

  it('prepends a new community to the sidebar when communities:created event fires', async () => {
    renderGroup()

    await screen.findByRole('link', {
      name: /Voucha Quality Filters With An Extra Long Sidebar Label/i,
    })

    const newCommunity = makeCommunity({
      id: 'community-new',
      name: 'Newly Created Community',
      slug: 'newly-created',
      markdown: null,
      list_type: 'follow',
      created_at: '2026-05-03T00:00:00.000Z',
      updated_at: '2026-05-03T00:00:00.000Z',
    })

    window.dispatchEvent(new CustomEvent('communities:created', { detail: newCommunity }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Newly Created Community/i })).toBeInTheDocument()
    })
  })

  it('preserves a created community when the initial fetch resolves after the event', async () => {
    let resolveSearch!: (value: Awaited<ReturnType<typeof mockSearchMyCommunities>>) => void
    mockSearchMyCommunities.mockReturnValue(
      new Promise(resolve => {
        resolveSearch = resolve
      }),
    )

    renderGroup()

    const newCommunity = makeCommunity({
      id: 'community-new',
      name: 'Newly Created Community',
      slug: 'newly-created',
      markdown: null,
      list_type: 'follow',
      created_at: '2026-05-03T00:00:00.000Z',
      updated_at: '2026-05-03T00:00:00.000Z',
    })

    window.dispatchEvent(new CustomEvent('communities:created', { detail: newCommunity }))

    const existingCommunity = makeCommunity({
      id: 'community-1',
      name: 'Voucha Quality Filters With An Extra Long Sidebar Label',
      slug: 'voucha-quality-filters',
      markdown: null,
      list_type: 'follow',
      created_at: '2026-05-03T00:00:00.000Z',
      updated_at: '2026-05-03T00:00:00.000Z',
    })

    resolveSearch(
      makeCommunitiesSearchResponse({
        communities: [existingCommunity],
        communityMetrics: {},
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Newly Created Community/i })).toBeInTheDocument()
      expect(
        screen.getByRole('link', {
          name: /Voucha Quality Filters With An Extra Long Sidebar Label/i,
        }),
      ).toBeInTheDocument()
    })
  })
})
