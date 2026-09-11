import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockGetCurrentUser, mockGetMyLandingPages } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetMyLandingPages: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('@/lib/api/server'), () => ({ getMyLandingPages: mockGetMyLandingPages }))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/components/my/landing-pages-index'), () => ({
  LandingPagesIndex: ({ username }: { username: string | null }) => (
    <div data-testid='landing-pages-index'>{username ?? 'no-username'}</div>
  ),
}))

import LandingPagesPage from './page'

describe('LandingPagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyLandingPages.mockResolvedValue({ results: [] })
  })

  it('renders the index with the current username', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'tester' })
    render(await LandingPagesPage())
    expect(screen.getByTestId('landing-pages-index').textContent).toBe('tester')
  })

  it('passes null username when there is no current user', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    render(await LandingPagesPage())
    expect(screen.getByTestId('landing-pages-index').textContent).toBe('no-username')
  })
})
