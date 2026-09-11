import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

import { BookmarkPageHeader } from '../bookmark-page-header'

describe('BookmarkPageHeader', () => {
  it('renders the heading with bookmark-page-heading data-pw', () => {
    const { container } = render(<BookmarkPageHeader routeKey='news-items/saved' />)
    expect(container.querySelector('[data-pw="bookmark-page-heading"]')).not.toBeNull()
  })

  it('renders cross-intent dropdown for family routes', () => {
    const { container } = render(<BookmarkPageHeader routeKey='news-items/saved' />)
    expect(container.querySelector('[data-pw="bookmark-title-dropdown-trigger"]')).not.toBeNull()
  })

  it('renders plain span for singleton routes (no dropdown)', () => {
    const { container } = render(<BookmarkPageHeader routeKey='users/followers' />)
    expect(container.querySelector('[data-pw="bookmark-page-heading"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="bookmark-title-dropdown-trigger"]')).toBeNull()
  })

  it('renders breadcrumbs nav', () => {
    render(<BookmarkPageHeader routeKey='news-items/saved' />)
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeDefined()
  })

  it('renders optional actions slot', () => {
    render(
      <BookmarkPageHeader
        routeKey='news-items/saved'
        actions={<button type='button'>Add</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add' })).toBeDefined()
  })
})
