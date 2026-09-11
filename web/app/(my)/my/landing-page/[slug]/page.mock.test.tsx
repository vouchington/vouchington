import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const {
  mockGetCurrentUser,
  mockGetMyLandingPages,
  mockGetMyLandingPage,
  mockGetMyLandingPageCandidates,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetMyLandingPages: vi.fn<VitestLooseMock>(),
  mockGetMyLandingPage: vi.fn<VitestLooseMock>(),
  mockGetMyLandingPageCandidates: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('not-found')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('@/lib/api/server'), () => ({
  getMyLandingPages: mockGetMyLandingPages,
  getMyLandingPage: mockGetMyLandingPage,
  getMyLandingPageCandidates: mockGetMyLandingPageCandidates,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/components/my/landing-page-editor'), () => ({
  LandingPageEditor: ({ username }: { username: string }) => (
    <div data-testid='landing-page-editor'>{username}</div>
  ),
}))
vi.mock(import('@/components/my/landing-pages-manager-sections'), () => ({
  LandingPagesUsernameRequired: () => <div data-testid='username-required'>username required</div>,
}))

import LandingPageEditorPage from './page'

const candidates = { candidates: { profile_links: [], reviews: [], referral_links: [] } }
const pageRow = { id: 'page-1', slug: 'my-page' }

describe('LandingPageEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyLandingPages.mockResolvedValue({ results: [pageRow] })
    mockGetMyLandingPage.mockResolvedValue({ landing_page: { ...pageRow, items: [] } })
    mockGetMyLandingPageCandidates.mockResolvedValue(candidates)
  })

  it('renders the editor for a resolved slug', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'tester' })
    render(await LandingPageEditorPage({ params: Promise.resolve({ slug: 'my-page' }) }))
    expect(screen.getByTestId('landing-page-editor').textContent).toBe('tester')
  })

  it('calls notFound when there is no current user', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(
      LandingPageEditorPage({ params: Promise.resolve({ slug: 'my-page' }) }),
    ).rejects.toThrow('not-found')
  })

  it('renders the username-required gate when the user has no username', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: null })
    render(await LandingPageEditorPage({ params: Promise.resolve({ slug: 'my-page' }) }))
    expect(screen.getByTestId('username-required')).toBeDefined()
  })

  it('calls notFound when the slug does not resolve', async () => {
    mockGetCurrentUser.mockResolvedValue({ username: 'tester' })
    await expect(
      LandingPageEditorPage({ params: Promise.resolve({ slug: 'missing' }) }),
    ).rejects.toThrow('not-found')
  })
})
