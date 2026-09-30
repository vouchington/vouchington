import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSidebar, setMockPathname } from '@/test-helpers/components/app-sidebar-fixtures'
import type { User } from '@/types/user'

describe('AppSidebar Bookmarks — Media intents', () => {
  beforeEach(() => {
    setMockPathname('/')
  })

  describe('Podcasts intent Bookmarks group', () => {
    beforeEach(() => {
      setMockPathname('/podcast-episodes')
    })

    it('hides Bookmarks groups for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Episode Bookmarks')).toBeNull()
      expect(screen.queryByText('Source Bookmarks')).toBeNull()
    })

    it('shows Episode Bookmarks and Source Bookmarks groups for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Episode Bookmarks')).toBeDefined()
      expect(screen.getByText('Source Bookmarks')).toBeDefined()
    })

    it('Saved Episodes link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved Episodes$/i }).getAttribute('href')).toBe(
        '/my/podcast-episodes/saved',
      )
    })

    it('Recently Viewed Podcasts link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(
        screen.getByRole('link', { name: /^Recently Viewed Podcasts$/i }).getAttribute('href'),
      ).toBe('/my/podcasts/viewed')
    })
  })

  describe('Videos intent Bookmarks group', () => {
    beforeEach(() => {
      setMockPathname('/videos')
    })

    it('hides Bookmarks groups for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Video Bookmarks')).toBeNull()
      expect(screen.queryByText('Source Bookmarks')).toBeNull()
    })

    it('shows Video Bookmarks and Source Bookmarks groups for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Video Bookmarks')).toBeDefined()
      expect(screen.getByText('Source Bookmarks')).toBeDefined()
    })

    it('Saved Videos link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Saved Videos$/i }).getAttribute('href')).toBe(
        '/my/videos/saved',
      )
    })

    it('Recently Viewed Channels link has correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(
        screen.getByRole('link', { name: /^Recently Viewed Channels$/i }).getAttribute('href'),
      ).toBe('/my/channels/viewed')
    })
  })
})
