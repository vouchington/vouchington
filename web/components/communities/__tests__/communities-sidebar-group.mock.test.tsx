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

  it('keeps long active community links horizontally constrained', async () => {
    const { container } = renderGroup()

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

    const content = container.querySelector('[data-sidebar="content"]')
    expect(content?.className).toContain('overflow-x-hidden')

    const activeButton = longCommunityLink.closest('[data-sidebar="menu-button"]')
    expect(activeButton?.className).toContain('box-border')
    expect(activeButton?.className).toContain('w-full')
    expect(activeButton?.className).toContain('max-w-full')
    expect(activeButton?.className).toContain('min-w-0')
    expect(activeButton?.className).not.toContain('data-[active=true]:font-medium')

    const label = longCommunityLink.querySelector('span')
    expect(label?.className).toContain('truncate')

    const item = activeButton?.closest('[data-sidebar="menu-item"]')
    expect(item?.className).toContain('min-w-0')
    expect(item?.className).toContain('max-w-full')
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
      expect(screen.getByRole('link', { name: /Newly Created Community/i })).toBeDefined()
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
      expect(screen.getByRole('link', { name: /Newly Created Community/i })).toBeDefined()
      expect(
        screen.getByRole('link', {
          name: /Voucha Quality Filters With An Extra Long Sidebar Label/i,
        }),
      ).toBeDefined()
    })
  })
})
