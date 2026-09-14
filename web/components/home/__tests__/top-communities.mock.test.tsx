import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopCommunities } from '../top-communities'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
  makeCommunityMetrics,
} from '@/test-helpers/api-responses'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import { projectTopCommunities } from '@/lib/view-models/homepage-view-models'

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

vi.mock(import('@/lib/links/entity-href'), () => ({
  communityHref: (community: { slug: string }) => `/communities/${community.slug}`,
}))

describe('TopCommunities', () => {
  it('renders error fallback when data is null', () => {
    render(<TopCommunities data={null} />)

    expect(screen.getByText('Unable to load communities.')).toBeDefined()
  })

  it('renders empty fallback when results are empty', () => {
    const data = makeCommunitiesSearchResponse({ communities: [] })

    render(<TopCommunities data={projectTopCommunities(data)} />)

    expect(screen.getByText('No communities yet.')).toBeDefined()
  })

  it('renders community links with names', () => {
    const community = makeCommunity({ name: 'Credit Card Fans', slug: 'credit-card-fans' })
    const data = makeCommunitiesSearchResponse({ communities: [community] })

    render(<TopCommunities data={projectTopCommunities(data)} />)

    const link = screen.getByRole('link', { name: /Credit Card Fans/ })
    expect(link.getAttribute('href')).toBe('/communities/credit-card-fans')
    expect(screen.getByRole('link', { name: 'Browse all communities →' })).toBeDefined()
  })

  it('formats member counts with the resolved UI locale', () => {
    const community = makeCommunity({
      name: 'Cafe Fans',
      slug: 'cafe-fans',
    })
    const data = makeCommunitiesSearchResponse({
      communities: [community],
      communityMetrics: {
        [community.id]: makeCommunityMetrics({ id: community.id, member_count: 1200 }),
      },
    })

    seedMessages('es', esMessages)

    render(
      <UiLocaleProvider uiLocale='es'>
        <TopCommunities data={projectTopCommunities(data)} />
      </UiLocaleProvider>,
    )

    expect(screen.getByRole('link', { name: /Cafe Fans/ }).textContent).toMatch(/1,2.*mil miembros/)
  })
})
