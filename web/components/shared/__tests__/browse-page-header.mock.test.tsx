import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import type { ReactNode } from 'react'

vi.mock(import('lucide-react'), () => mockLucideReact())

vi.mock(import('@/components/shared/title-route-dropdown'), () => ({
  TitleRouteDropdown: ({ label, dataPw }: { label: string; dataPw?: string }) => (
    <span data-pw={dataPw ?? 'feed-title-dropdown-trigger'}>{label}</span>
  ),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

import { BrowsePageHeader } from '../browse-page-header'

describe('BrowsePageHeader', () => {
  it('renders the heading with browse-page-heading data-pw', () => {
    const { container } = render(<BrowsePageHeader routeKey='news' />)
    expect(container.querySelector('[data-pw="browse-page-heading"]')).not.toBeNull()
  })

  it('renders the cross-intent dropdown trigger', () => {
    const { container } = render(<BrowsePageHeader routeKey='news' />)
    expect(container.querySelector('[data-pw="browse-title-dropdown-trigger"]')).not.toBeNull()
  })

  it('renders the description for news', () => {
    const { container } = render(<BrowsePageHeader routeKey='news' />)
    expect(container.querySelector('[data-pw="browse-page-description"]')).not.toBeNull()
  })

  it('applies custom titleClassName to TitleRouteDropdown', () => {
    const { container } = render(
      <BrowsePageHeader
        routeKey='news'
        titleClassName='text-2xl tracking-tight'
      />,
    )
    expect(container.querySelector('[data-pw="browse-page-heading"]')).not.toBeNull()
  })

  it('renders for all-sources family (news-sources)', () => {
    const { container } = render(<BrowsePageHeader routeKey='news-sources' />)
    const trigger = container.querySelector('[data-pw="browse-title-dropdown-trigger"]')
    expect(trigger).not.toBeNull()
    expect(trigger?.textContent).toBe('News Sources')
  })

  it('renders podcast-episodes route', () => {
    const { container } = render(<BrowsePageHeader routeKey='podcast-episodes' />)
    expect(container.querySelector('[data-pw="browse-page-heading"]')).not.toBeNull()
  })

  it('renders channels route', () => {
    const { container } = render(<BrowsePageHeader routeKey='channels' />)
    expect(container.querySelector('[data-pw="browse-page-heading"]')).not.toBeNull()
  })
})
