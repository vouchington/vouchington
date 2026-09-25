import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderSidebar, setMockPathname } from '@/test-helpers/components/app-sidebar-test-helpers'
import type { User } from '@/types/user'

describe('AppSidebar intent sections', () => {
  beforeEach(() => setMockPathname('/'))

  describe('Topics intent', () => {
    beforeEach(() => setMockPathname('/topics'))

    it('shows Topics Browse group for unauthenticated users', () => {
      renderSidebar()
      expect(screen.getByRole('link', { name: /All Topics/i })).toHaveAttribute('href', '/topics')
    })

    it('shows Cards and Rewards Programs for unauthenticated users', () => {
      renderSidebar()
      expect(screen.getByRole('link', { name: /^Cards$/i })).toHaveAttribute('href', '/cards')
      expect(screen.getByRole('link', { name: /^Rewards Programs$/i })).toHaveAttribute(
        'href',
        '/rewards-programs',
      )
    })

    it('shows Recommend New Topics for authenticated users', () => {
      renderSidebar({ id: 'u1', roles: ['user'] } as User)
      expect(screen.getByRole('link', { name: /^Recommend New Topics$/i })).toHaveAttribute(
        'href',
        '/topic-recommendations',
      )
    })

    it('shows Topics admin links for administrators', () => {
      renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
      expect(screen.getByRole('link', { name: /Create Topic/i })).toHaveAttribute(
        'href',
        '/topics/create',
      )
      expect(screen.getByRole('link', { name: /Topic Aliases/i })).toHaveAttribute(
        'href',
        '/topics/aliases',
      )
    })
  })

  describe('Web Search intent', () => {
    beforeEach(() => setMockPathname('/domains'))

    it.each([null, { id: 'u1', roles: ['user'] } as User])(
      'shows Domains link for user %s',
      user => {
        renderSidebar(user)
        expect(screen.getByRole('link', { name: /^Domains$/i })).toHaveAttribute('href', '/domains')
      },
    )
  })

  describe('Growth intent', () => {
    it.each([null, { id: 'u1', roles: ['user'] } as User])(
      'hides Growth group for user %s at /',
      user => {
        renderSidebar(user)
        expect(screen.queryByText('Growth')).toBeNull()
      },
    )

    it.each(['administrator', 'investor'] as const)('shows Growth link for %s', role => {
      setMockPathname('/growth')
      renderSidebar({ id: 'u1', roles: [role] } as User)
      expect(screen.getAllByText('Growth').length).toBeGreaterThan(0)
      expect(screen.getByRole('link', { name: /^Growth$/i })).toHaveAttribute('href', '/growth')
    })

    it('hides News Admin group for investors at /', () => {
      renderSidebar({ id: 'u1', roles: ['investor'] } as User)
      expect(screen.queryByRole('link', { name: /RSS Feed Categories/i })).toBeNull()
    })
  })
})
