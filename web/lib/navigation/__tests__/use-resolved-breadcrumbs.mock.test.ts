import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUsePathname = vi.hoisted(() => vi.fn<() => string>())
const mockUseResolvedIntent = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockUseAuth = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockGetIntentById = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockBuildBreadcrumbs = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('next/navigation'), () => ({
  usePathname: mockUsePathname,
}))
vi.mock(import('@/lib/navigation/intents/nav-intent-context'), () => ({
  useResolvedIntent: mockUseResolvedIntent,
}))
vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: mockUseAuth,
}))
vi.mock(import('@/lib/navigation/intents'), () => ({
  getIntentById: mockGetIntentById,
}))
vi.mock(import('@/lib/navigation/breadcrumbs'), () => ({ buildBreadcrumbs: mockBuildBreadcrumbs }))

import { useResolvedBreadcrumbs } from '@/lib/navigation/use-resolved-breadcrumbs'
import type { BreadcrumbNavItem } from '@/lib/seo/structured-data'

const MOCK_INTENT = { id: 'posts', label: 'Posts' }

describe('useResolvedBreadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePathname.mockReturnValue('/posts')
    mockUseResolvedIntent.mockReturnValue('posts')
    mockUseAuth.mockReturnValue({ currentUser: { id: 'u1', roles: [] }, isAuthenticated: true })
    mockGetIntentById.mockReturnValue(MOCK_INTENT)
    mockBuildBreadcrumbs.mockReturnValue([])
  })

  it('calls buildBreadcrumbs with resolved intent and auth state', () => {
    const tail: BreadcrumbNavItem[] = [{ name: 'Post', path: '/posts/1' }]
    renderHook(() => useResolvedBreadcrumbs({ tail }))
    expect(mockBuildBreadcrumbs).toHaveBeenCalledWith({
      intent: MOCK_INTENT,
      isAuthenticated: true,
      userRoles: [],
      tail,
      intentCrumbOverride: undefined,
    })
  })

  it('passes intent: null when resolvedIntentId is null', () => {
    mockUseResolvedIntent.mockReturnValue(null)
    renderHook(() => useResolvedBreadcrumbs({ tail: [] }))
    expect(mockBuildBreadcrumbs).toHaveBeenCalledWith(expect.objectContaining({ intent: null }))
  })

  it('does not call getIntentById when resolvedIntentId is null', () => {
    mockUseResolvedIntent.mockReturnValue(null)
    renderHook(() => useResolvedBreadcrumbs({ tail: [] }))
    expect(mockGetIntentById).not.toHaveBeenCalled()
  })

  it('passes intentCrumbOverride when provided', () => {
    const override: BreadcrumbNavItem = { name: 'Custom', path: '/custom' }
    renderHook(() => useResolvedBreadcrumbs({ tail: [], intentCrumbOverride: override }))
    expect(mockBuildBreadcrumbs).toHaveBeenCalledWith(
      expect.objectContaining({ intentCrumbOverride: override }),
    )
  })

  it('passes isAuthenticated: false for unauthenticated user', () => {
    mockUseAuth.mockReturnValue({ currentUser: null, isAuthenticated: false })
    renderHook(() => useResolvedBreadcrumbs({ tail: [] }))
    expect(mockBuildBreadcrumbs).toHaveBeenCalledWith(
      expect.objectContaining({ isAuthenticated: false, userRoles: [] }),
    )
  })

  it('returns the value from buildBreadcrumbs', () => {
    const crumbs: BreadcrumbNavItem[] = [{ name: 'Home', path: '/' }]
    mockBuildBreadcrumbs.mockReturnValue(crumbs)
    const { result } = renderHook(() => useResolvedBreadcrumbs({ tail: [] }))
    expect(result.current).toBe(crumbs)
  })

  it('passes userRoles from currentUser to buildBreadcrumbs', () => {
    mockUseAuth.mockReturnValue({
      currentUser: { id: 'u1', roles: ['admin'] },
      isAuthenticated: true,
    })
    renderHook(() => useResolvedBreadcrumbs({ tail: [] }))
    expect(mockBuildBreadcrumbs).toHaveBeenCalledWith(
      expect.objectContaining({ userRoles: ['admin'] }),
    )
  })
})
