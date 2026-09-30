import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSidebar, setMockPathname } from '@/test-helpers/components/app-sidebar-test-helpers'
import type { User } from '@/types/user'

describe('AppSidebar Bookmarks', () => {
  beforeEach(() => {
    setMockPathname('/')
  })

  describe('Posts intent Bookmarks group', () => {
    beforeEach(() => {
      setMockPathname('/posts')
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })

    it('shows Bookmarks group for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Bookmarks')).toBeDefined()
    })

    it('Saved Posts link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved Posts$/i }).getAttribute('href')).toBe(
        '/my/posts/saved',
      )
    })
  })

  describe('Topics intent Bookmarks group', () => {
    beforeEach(() => {
      setMockPathname('/topics')
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })

    it('shows Bookmarks group for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Bookmarks')).toBeDefined()
    })

    it('Followed Topics link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Followed Topics$/i }).getAttribute('href')).toBe(
        '/my/topics/following',
      )
    })
  })

  describe('Web Search intent Bookmarks group', () => {
    beforeEach(() => {
      setMockPathname('/domains')
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })

    it('shows Bookmarks group for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Bookmarks')).toBeDefined()
    })

    it('Saved Links link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved Links$/i }).getAttribute('href')).toBe(
        '/my/urls/saved',
      )
    })
  })

  describe('Communities intent Bookmarks group', () => {
    beforeEach(() => {
      setMockPathname('/communities')
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      // Unauthenticated communities renders config-driven groups (CommunitiesSidebarGroup
      // only mounts for authenticated users). The Bookmarks group has requiresAuth:true so
      // it is filtered out for unauthenticated visitors.
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })
    // Note: authenticated communities Bookmarks come from CommunitiesSidebarGroup (dynamic
    // import), which does not resolve synchronously in vitest/jsdom. Authenticated coverage
    // is provided by the Playwright spec (sidebar-bookmarks.spec.mts).
  })

  describe('News intent Bookmarks group', () => {
    beforeEach(() => {
      setMockPathname('/news')
    })

    it('hides Bookmarks groups for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('News Bookmarks')).toBeNull()
      expect(screen.queryByText('Source Bookmarks')).toBeNull()
    })

    it('shows News Bookmarks and Source Bookmarks groups for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('News Bookmarks')).toBeDefined()
      expect(screen.getByText('Source Bookmarks')).toBeDefined()
    })

    it('Saved News link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved News$/i }).getAttribute('href')).toBe(
        '/my/news-items/saved',
      )
    })

    it('Followed News Sources link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(
        screen.getByRole('link', { name: /^Followed News Sources$/i }).getAttribute('href'),
      ).toBe('/my/news-sources')
    })

    it('Recently Viewed News Sources link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(
        screen.getByRole('link', { name: /^Recently Viewed News Sources$/i }).getAttribute('href'),
      ).toBe('/my/news-sources/viewed')
    })
  })

  describe('Friends intent Bookmarks group', () => {
    beforeEach(() => {
      setMockPathname('/users')
    })

    it('hides Bookmarks group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Bookmarks')).toBeNull()
    })

    it('shows Bookmarks group for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Bookmarks')).toBeDefined()
    })

    it('Following link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Following$/i }).getAttribute('href')).toBe(
        '/my/users/following',
      )
    })
  })
})
