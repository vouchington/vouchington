import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderSidebar, setMockPathname } from '@/test-helpers/components/app-sidebar-test-helpers'

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

  it('shows Explore Communities when on the Communities intent', () => {
    setMockPathname('/communities')
    renderSidebar()
    const link = screen.getByRole('link', { name: /^Explore$/i })
    expect(link.getAttribute('href')).toBe('/communities')
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

describe('sidebar animation', () => {
  it('inner wrapper has horizontal-shift transition classes for offcanvas collapse', () => {
    const { container } = renderSidebar()

    const inner = container
      .querySelector('[data-sidebar="sidebar"]')
      ?.closest('[class*="transition-[width,translate]"]')
    expect(inner).not.toBeNull()
    expect(inner?.className).toContain('transition-[width,translate]')
    expect(inner?.className).toContain('translate-x-0')
    expect(inner?.className).toContain(
      'group-data-[collapsible=offcanvas]:group-data-[side=left]:-translate-x-full',
    )
    expect(inner?.className).toContain(
      'group-data-[collapsible=offcanvas]:group-data-[side=right]:translate-x-full',
    )
  })

  it('keeps active menu rows dimension-stable', () => {
    setMockPathname('/data-points')
    const { container } = renderSidebar()

    const content = container.querySelector('[data-sidebar="content"]')
    expect(content?.className).toContain('overflow-x-hidden')
    expect(content?.className).toContain('overflow-y-auto')

    const dataPointsLink = screen.getByRole('link', { name: /Data Points/i })
    const activeButton = dataPointsLink.closest('[data-sidebar="menu-button"]')
    expect(activeButton).not.toBeNull()
    expect(activeButton?.className).toContain('box-border')
    expect(activeButton?.className).toContain('w-full')
    expect(activeButton?.className).toContain('max-w-full')
    expect(activeButton?.className).toContain('min-w-0')
    expect(activeButton?.className).toContain('focus-visible:ring-inset')
    expect(activeButton?.className).toContain('transition-[background-color,color,box-shadow]')
    expect(activeButton?.className).not.toContain('data-[active=true]:font-medium')

    const item = activeButton?.closest('[data-sidebar="menu-item"]')
    expect(item?.className).toContain('min-w-0')
    expect(item?.className).toContain('max-w-full')
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
