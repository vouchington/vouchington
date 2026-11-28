import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderSidebar, setMockPathname } from '@/test-helpers/components/app-sidebar-fixtures'

describe('sidebar structure', () => {
  beforeEach(() => {
    setMockPathname('/')
  })

  it('does not show removed items (All Posts, Cards, Spending Categories, Rewards Programs, Rewards Program Statuses, Articles, Blog Posts)', () => {
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^All Posts$/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Cards$/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Spending Categories$/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Rewards Programs$/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Rewards Program Statuses$/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Articles$/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Blog Posts$/i })).toBeNull()
  })

  it('shows All Topics when on the Topics intent', () => {
    setMockPathname('/topics')
    renderSidebar()
    const link = screen.getByRole('link', { name: /All Topics/i })
    expect(link.getAttribute('href')).toBe('/topics')
  })

  it('shows Stories under Posts intent with correct href', () => {
    setMockPathname('/posts')
    renderSidebar()
    const link = screen.getByRole('link', { name: /^Stories$/i })
    expect(link.getAttribute('href')).toBe('/stories')
  })

  it('does not show Trending in sidebar', () => {
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^Trending$/i })).toBeNull()
  })

  it('shows Domains when on the Web Search intent', () => {
    setMockPathname('/domains')
    renderSidebar()
    const link = screen.getByRole('link', { name: /Domains/i })
    expect(link.getAttribute('href')).toBe('/domains')
  })

  it('shows Sources in Web Search intent', () => {
    setMockPathname('/sources')
    renderSidebar()
    const link = screen.getByRole('link', { name: /^Sources$/i })
    expect(link.getAttribute('href')).toBe('/sources')
  })
})

describe('sidebar active state', () => {
  it('marks the current page menu button active', () => {
    setMockPathname('/data-points')
    renderSidebar()

    const dataPointsLink = screen.getByRole('link', { name: /Data Points/i })
    expect(dataPointsLink.closest('[data-sidebar="menu-button"]')).toHaveAttribute(
      'data-active',
      'true',
    )
  })
})

describe('Explore section navigation', () => {
  beforeEach(() => {
    setMockPathname('/')
  })

  it('Data Points link is clickable and not disabled when on /discussions', () => {
    setMockPathname('/discussions')
    renderSidebar()

    const dataPointsLink = screen.getByRole('link', { name: /Data Points/i })
    expect(dataPointsLink.getAttribute('href')).toBe('/data-points')
    expect(dataPointsLink).not.toHaveAttribute('aria-disabled')
    expect(dataPointsLink.closest('[aria-disabled]')).toBeNull()
    expect(dataPointsLink).not.toHaveAttribute('disabled')
    expect(dataPointsLink.closest('[data-active]')).toBeNull()
  })

  it('Data Points is active on /data-points', () => {
    setMockPathname('/data-points')
    renderSidebar()

    const dataPointsLink = screen.getByRole('link', { name: /Data Points/i })
    expect(dataPointsLink.closest('[data-active]')?.getAttribute('data-active')).toBe('true')
  })
})
