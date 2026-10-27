import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import type { NavIntentId } from '@/lib/navigation/intents/types'

const mockUseResolvedIntent = vi.hoisted(() => vi.fn<(pathname: string) => NavIntentId | null>())
const mockUseAuth = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock<typeof import('next/navigation')>(import('next/navigation'), () => navMockModule)
vi.mock(import('@/lib/navigation/intents/nav-intent-context'), () => ({
  useResolvedIntent: mockUseResolvedIntent,
}))
vi.mock(import('@/lib/auth/context'), () => ({ useAuth: mockUseAuth }))

import { useResolvedBreadcrumbs } from '@/lib/navigation/use-resolved-breadcrumbs'

const nav = createNavMock()

describe('useResolvedBreadcrumbs', () => {
  beforeEach(() => {
    nav.reset()
    mockUseResolvedIntent.mockReset()
    mockUseAuth.mockReset()
  })

  it('uses the resolved intent landing and keeps the supplied tail', () => {
    nav.setPathname('/posts/123')
    mockUseResolvedIntent.mockImplementation(pathname =>
      pathname === '/posts/123' ? 'posts' : null,
    )
    mockUseAuth.mockReturnValue({ currentUser: { id: 'user-1', roles: [] }, isAuthenticated: true })

    const { result } = renderHook(() =>
      useResolvedBreadcrumbs({ tail: [{ name: 'A post', path: '/posts/123' }] }),
    )

    expect(result.current).toEqual([
      { nameKey: 'extracted.intents.productPosts.posts_a80811cf', path: '/feed/posts' },
      { name: 'A post', path: '/posts/123' },
    ])
  })

  it('uses Home and the tail when there is no resolved intent for an anonymous user', () => {
    nav.setPathname('/utility')
    mockUseResolvedIntent.mockReturnValue(null)
    mockUseAuth.mockReturnValue({ currentUser: null, isAuthenticated: false })

    const { result } = renderHook(() =>
      useResolvedBreadcrumbs({ tail: [{ name: 'Utility', path: '/utility' }] }),
    )

    expect(result.current).toEqual([
      { nameKey: 'nav.home', path: '/' },
      { name: 'Utility', path: '/utility' },
    ])
  })

  it('uses the public moderation landing when currentUser roles are absent', () => {
    nav.setPathname('/appeals')
    mockUseResolvedIntent.mockReturnValue('moderation')
    mockUseAuth.mockReturnValue({ currentUser: { id: 'user-1' }, isAuthenticated: true })

    const { result } = renderHook(() =>
      useResolvedBreadcrumbs({ tail: [{ name: 'Appeals', path: '/appeals' }] }),
    )

    expect(result.current).toEqual([
      { nameKey: 'extracted.intents.admin.moderation_126d4415', path: '/my/appeals' },
      { name: 'Appeals', path: '/appeals' },
    ])
  })

  it('uses the administrator moderation landing when the user has that role', () => {
    nav.setPathname('/reports/review-queue')
    mockUseResolvedIntent.mockReturnValue('moderation')
    mockUseAuth.mockReturnValue({
      currentUser: { id: 'user-1', roles: ['administrator'] },
      isAuthenticated: true,
    })

    const { result } = renderHook(() =>
      useResolvedBreadcrumbs({ tail: [{ name: 'Review queue', path: '/reports/review-queue' }] }),
    )

    expect(result.current).toEqual([
      { nameKey: 'extracted.intents.admin.moderation_126d4415', path: '/reports' },
      { name: 'Review queue', path: '/reports/review-queue' },
    ])
  })

  it('uses an explicit intent crumb override as the authenticated root', () => {
    nav.setPathname('/community/posts/123')
    mockUseResolvedIntent.mockReturnValue(null)
    mockUseAuth.mockReturnValue({ currentUser: { id: 'user-1', roles: [] }, isAuthenticated: true })

    const { result } = renderHook(() =>
      useResolvedBreadcrumbs({
        intentCrumbOverride: { name: 'Community', path: '/community' },
        tail: [{ name: 'A post', path: '/community/posts/123' }],
      }),
    )

    expect(result.current).toEqual([
      { name: 'Community', path: '/community' },
      { name: 'A post', path: '/community/posts/123' },
    ])
  })
})
