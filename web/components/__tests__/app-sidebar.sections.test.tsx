import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderSidebar, setMockPathname } from '@/test-helpers/components/app-sidebar-test-helpers'
import type { User } from '@/types/user'

describe('AppSidebar', () => {
  beforeEach(() => {
    setMockPathname('/')
  })

  describe('News intent Browse group', () => {
    it('shows Browse group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.getByText('Browse')).toBeDefined()
    })

    it('shows Browse group for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Browse')).toBeDefined()
    })

    it('hides My News Feed for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByRole('link', { name: /^My News Feed$/i })).toBeNull()
    })

    it('shows My News Feed for authenticated users with correct href', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      const link = screen.getByRole('link', { name: /^My News Feed$/i })
      expect(link.getAttribute('href')).toBe('/feed/news')
    })

    it('My News Feed appears before All News Sources in DOM for authenticated users', () => {
      const { container } = renderSidebar({ id: 'u1', roles: ['user'] } as User)
      const links = [...container.querySelectorAll('a[href]')]
      const hrefs = links.map(a => a.getAttribute('href'))
      const myNewsFeedIdx = hrefs.indexOf('/feed/news')
      const allNewsSourcesIdx = hrefs.indexOf('/news-sources')
      expect(myNewsFeedIdx).toBeGreaterThanOrEqual(0)
      expect(myNewsFeedIdx).toBeLessThan(allNewsSourcesIdx)
    })

    it('shows public Browse links for unauthenticated users', () => {
      renderSidebar()
      expect(screen.getByRole('link', { name: /^All News$/i }).getAttribute('href')).toBe('/news')
      expect(screen.getByRole('link', { name: /^All News Sources$/i }).getAttribute('href')).toBe(
        '/news-sources',
      )
    })

    it('shows Explore link for unauthenticated users on communities intent', () => {
      setMockPathname('/communities')
      renderSidebar()
      const link = screen.getByRole('link', { name: /^Explore$/i })
      expect(link.getAttribute('href')).toBe('/communities')
    })
  })

  describe('Feeds section removed', () => {
    it('does not show a Feeds section label for unauthenticated users', () => {
      renderSidebar()
      expect(screen.queryByText('Feeds')).toBeNull()
    })

    it('does not show a Feeds section label for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.queryByText('Feeds')).toBeNull()
    })
  })

  describe('Landing Pages and Referral Links intents', () => {
    it('hides Share group — Landing Pages and Referrals are separate intents', () => {
      renderSidebar()
      expect(screen.queryByText('Share')).toBeNull()
      expect(screen.queryByRole('link', { name: /Landing Pages/i })).toBeNull()
      expect(screen.queryByRole('link', { name: /^Referrals$/i })).toBeNull()
    })

    it('shows My Landing Pages for authenticated users on landing-pages intent', () => {
      setMockPathname('/my/landing-pages')
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      const link = screen.getByRole('link', { name: /My Landing Pages/i })
      expect(link.getAttribute('href')).toBe('/my/landing-pages')
    })

    it('shows Referral Programs and hides My Referral Link Feed for unauthenticated users', () => {
      setMockPathname('/referral-programs')
      renderSidebar()
      expect(screen.getByRole('link', { name: /^Referral Programs$/i }).getAttribute('href')).toBe(
        '/referral-programs',
      )
      expect(screen.queryByRole('link', { name: /^My Referral Link Feed$/i })).toBeNull()
    })

    it('shows My Referral Link Feed for authenticated users on referral-links intent', () => {
      setMockPathname('/referral-programs')
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      const link = screen.getByRole('link', { name: /^My Referral Link Feed$/i })
      expect(link.getAttribute('href')).toBe('/feed/referral-links')
    })

    it('shows My Referral Link Feed before Referral Programs for authenticated users', () => {
      setMockPathname('/referral-programs')
      const { container } = renderSidebar({ id: 'u1', roles: ['user'] } as User)
      const links = Array.from(container.querySelectorAll('a[href]'))
      const hrefs = links.map(a => a.getAttribute('href'))
      const feedIdx = hrefs.indexOf('/feed/referral-links')
      const programsIdx = hrefs.indexOf('/referral-programs')
      expect(feedIdx).toBeGreaterThanOrEqual(0)
      expect(feedIdx).toBeLessThan(programsIdx)
    })

    it('hides Voucha Referral Program group without auth, shows it when authenticated', () => {
      setMockPathname('/referral-programs')
      renderSidebar()
      expect(screen.queryByText('Voucha Referral Program')).toBeNull()
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByText('Voucha Referral Program')).toBeDefined()
    })
  })
})
