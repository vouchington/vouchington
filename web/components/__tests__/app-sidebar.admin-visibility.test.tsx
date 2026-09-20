import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSidebar, setMockPathname } from '@/test-helpers/components/app-sidebar-test-helpers'
import type { User } from '@/types/user'

describe('AppSidebar Admin section visibility', () => {
  beforeEach(() => {
    setMockPathname('/')
  })

  it('hides admin sections for unauthenticated users', () => {
    renderSidebar()
    expect(screen.queryByText('CMS')).toBeNull()
    expect(screen.queryByText('CRM')).toBeNull()
    expect(screen.queryByText('Engineering')).toBeNull()
    expect(screen.queryByText('Design')).toBeNull()
  })

  it('hides admin sections for authenticated non-admin users', () => {
    renderSidebar({ id: 'u1', roles: ['user'] } as User)
    expect(screen.queryByText('CMS')).toBeNull()
    expect(screen.queryByText('CRM')).toBeNull()
    expect(screen.queryByText('Engineering')).toBeNull()
    expect(screen.queryByText('Design')).toBeNull()
  })

  it('shows Moderation intent for administrators on moderation routes', () => {
    setMockPathname('/reports')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    expect(screen.getAllByText('Moderation').length).toBeGreaterThan(0)
    expect(screen.queryByText('Design')).toBeNull()
  })

  it('shows CRM intent for administrators on CRM routes', () => {
    setMockPathname('/crm')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    expect(screen.getAllByText('CRM').length).toBeGreaterThan(0)
    expect(screen.queryByText('Design')).toBeNull()
  })

  it('shows Engineering intent for administrators on engineering routes', () => {
    setMockPathname('/admin/queues')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    expect(screen.getByText('Operations')).toBeDefined()
    expect(screen.getByRole('link', { name: /Dynamic Config/i })).toBeDefined()
    expect(screen.queryByText('Design')).toBeNull()
  })

  it.each(['moderator', 'developer', 'customer_support', 'investor'])(
    'shows only Dynamic Config to a %s',
    role => {
      setMockPathname('/admin/dynamic-config')
      renderSidebar({ id: 'u1', roles: [role] } as User)

      expect(screen.getByRole('link', { name: /Dynamic Config/i })).toHaveAttribute(
        'href',
        '/admin/dynamic-config',
      )
      expect(screen.queryByText('Operations')).toBeNull()
      expect(screen.queryByRole('link', { name: /^Queues$/i })).toBeNull()
      expect(screen.queryByRole('link', { name: /^PostgreSQL$/i })).toBeNull()
      expect(screen.queryByRole('link', { name: /^Valkey$/i })).toBeNull()
    },
  )

  it('shows moderation admin links for administrators', () => {
    setMockPathname('/reports')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    expect(screen.getByText('Review Queue')).toBeDefined()
    expect(screen.getByText('Vote Integrity')).toBeDefined()
    expect(screen.getByRole('link', { name: /Review Queue/i }).getAttribute('href')).toBe(
      '/posts/review-queue',
    )
    expect(screen.getByRole('link', { name: /Vote Integrity/i }).getAttribute('href')).toBe(
      '/vote-integrity/flags',
    )
    expect(screen.getByRole('link', { name: /Mod Log/i }).getAttribute('data-pw')).toBe(
      'sidebar-link-mod-log',
    )
  })

  it('shows CRM admin links for administrators', () => {
    setMockPathname('/crm')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    expect(screen.getByText('Memberships')).toBeDefined()
    expect(screen.getAllByText('Support').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('link', { name: /Memberships/i }).getAttribute('href')).toBe(
      '/memberships/grants',
    )
    const supportLinks = screen.getAllByRole('link', { name: /^Support$/i })
    expect(supportLinks.some(l => l.getAttribute('href') === '/support')).toBe(true)
  })

  it('shows Engineering admin links for administrators', () => {
    setMockPathname('/admin/queues')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    expect(screen.getByText('Queues')).toBeDefined()
    expect(screen.getByText('PostgreSQL')).toBeDefined()
    expect(screen.getByText('Valkey')).toBeDefined()
    expect(screen.getByRole('link', { name: /Dynamic Config/i })).toBeDefined()
    expect(screen.getByText('Operations')).toBeDefined()
    expect(screen.getByRole('link', { name: /Queues/i }).getAttribute('href')).toBe('/admin/queues')
    expect(screen.getByRole('link', { name: /PostgreSQL/i }).getAttribute('href')).toBe(
      '/admin/postgresql',
    )
    expect(screen.getByRole('link', { name: /Valkey/i }).getAttribute('href')).toBe('/admin/valkey')
    expect(screen.getByRole('link', { name: /Dynamic Config/i }).getAttribute('href')).toBe(
      '/admin/dynamic-config',
    )
  })

  it('shows Topics admin links (RSS Feed Categories) for administrators', () => {
    setMockPathname('/topics')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    expect(screen.getByText('RSS Feed Categories')).toBeDefined()
    expect(screen.getByRole('link', { name: /RSS Feed Categories/i }).getAttribute('href')).toBe(
      '/rss-feed-categories',
    )
  })

  it('shows Posts admin links for administrators', () => {
    setMockPathname('/posts')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    expect(screen.getByText('Curated Asides')).toBeDefined()
    expect(screen.getByRole('link', { name: /Curated Asides/i }).getAttribute('href')).toBe(
      '/curated-asides/topics',
    )
  })

  it('shows Topics admin links for administrators', () => {
    setMockPathname('/topics')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    expect(screen.getByText('Create Topic')).toBeDefined()
    expect(screen.getByText('Topic Aliases')).toBeDefined()
    expect(screen.getByRole('link', { name: /Create Topic/i }).getAttribute('href')).toBe(
      '/topics/create',
    )
    expect(screen.getByRole('link', { name: /Topic Aliases/i }).getAttribute('href')).toBe(
      '/topics/aliases',
    )
    expect(screen.getByRole('link', { name: /Topic Aliases/i }).getAttribute('data-pw')).toBe(
      'sidebar-nav-topic-aliases',
    )
  })

  it('shows URLs link in Web Search browse for authenticated users', () => {
    setMockPathname('/domains')
    renderSidebar({ id: 'u1', roles: ['user'] } as User)
    expect(screen.getByText('URLs')).toBeDefined()
    expect(screen.getByRole('link', { name: /^URLs$/i }).getAttribute('href')).toBe('/urls')
  })

  it('URLs is active on url detail route', () => {
    setMockPathname('/url/123')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const link = screen.getByRole('link', { name: /^URLs$/i })
    expect(link.closest('[data-active]')?.getAttribute('data-active')).toBe('true')
  })

  it('Create Topic is active on /topics/create', () => {
    setMockPathname('/topics/create')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const link = screen.getByRole('link', { name: /Create Topic/i })
    expect(link.closest('[data-active]')?.getAttribute('data-active')).toBe('true')
  })

  it('Topic Aliases is active on /topics/aliases', () => {
    setMockPathname('/topics/aliases')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const link = screen.getByRole('link', { name: /Topic Aliases/i })
    expect(link.closest('[data-active]')?.getAttribute('data-active')).toBe('true')
  })

  it('Recommend New Topics is active on /topic-recommendations', () => {
    setMockPathname('/topic-recommendations')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const link = screen.getByRole('link', { name: /^Recommend New Topics$/i })
    expect(link.closest('[data-active]')?.getAttribute('data-active')).toBe('true')
  })

  it('RSS Feed Categories is active on /rss-feed-categories', () => {
    setMockPathname('/rss-feed-categories')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const link = screen.getByRole('link', { name: /RSS Feed Categories/i })
    expect(link.closest('[data-active]')?.getAttribute('data-active')).toBe('true')
  })

  it('Curated Asides is active on /curated-asides/topics', () => {
    setMockPathname('/curated-asides/topics')
    renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const link = screen.getByRole('link', { name: /Curated Asides/i })
    expect(link.closest('[data-active]')?.getAttribute('data-active')).toBe('true')
  })
})
