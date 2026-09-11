import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommunityModlogPage from './page'

const getCurrentUserMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityModlogMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const notFoundMock = vi.hoisted(() => vi.fn<() => never>())
const redirectMock = vi.hoisted(() => vi.fn<(path: string) => never>())

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: getCurrentUserMock,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: getCommunityMock,
  getCommunityModlog: getCommunityModlogMock,
}))

vi.mock(import('next/navigation'), () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(import('@/components/communities/community-modlog-panel'), () => ({
  CommunityModlogPanel: ({ community }: { community: { name: string }; initialData: unknown }) => (
    <div
      data-testid='modlog-panel'
      data-community={community.name}
    >
      Modlog panel
    </div>
  ),
}))

const mockUser = {
  id: 'user-1',
  username: 'moderator',
  roles: [],
}

const mockAdmin = {
  id: 'admin-1',
  username: 'admin',
  roles: ['administrator'],
}

const mockCommunityData = {
  community: { id: 'community-1', name: 'Test Community', slug: 'test-community' },
  membership: { user_id: 'user-1', community_id: 'community-1', role: 'owner', removed_at: null },
}

const mockModlogData = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  moderator_actions: {},
  users: {},
}

describe('CommunityModlogPage', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset()
    getCommunityMock.mockReset()
    getCommunityModlogMock.mockReset()
    notFoundMock.mockReset()
    redirectMock.mockReset()
    notFoundMock.mockImplementation(() => {
      throw new Error('not found')
    })
    redirectMock.mockImplementation(() => {
      throw new Error('redirect')
    })
    getCommunityModlogMock.mockResolvedValue(mockModlogData)
  })

  it('renders the modlog panel for an owner', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue(mockCommunityData)

    const page = await CommunityModlogPage({ params: Promise.resolve({ slug: 'test-community' }) })
    render(page as unknown as ReactNode)

    expect(screen.getByTestId('modlog-panel')).toBeDefined()
  })

  it('renders the modlog panel for a moderator', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue({
      ...mockCommunityData,
      membership: { ...mockCommunityData.membership, role: 'moderator' },
    })

    const page = await CommunityModlogPage({ params: Promise.resolve({ slug: 'test-community' }) })
    render(page as unknown as ReactNode)

    expect(screen.getByTestId('modlog-panel')).toBeDefined()
  })

  it('renders the modlog panel for an admin user (no membership)', async () => {
    getCurrentUserMock.mockResolvedValue(mockAdmin)
    getCommunityMock.mockResolvedValue({ ...mockCommunityData, membership: null })

    const page = await CommunityModlogPage({ params: Promise.resolve({ slug: 'test-community' }) })
    render(page as unknown as ReactNode)

    expect(screen.getByTestId('modlog-panel')).toBeDefined()
  })

  it('redirects unauthenticated users to login', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    await expect(
      CommunityModlogPage({ params: Promise.resolve({ slug: 'test-community' }) }),
    ).rejects.toThrow('redirect')
  })

  it('calls notFound for non-members', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue({
      ...mockCommunityData,
      membership: { ...mockCommunityData.membership, role: 'member' },
    })

    await expect(
      CommunityModlogPage({ params: Promise.resolve({ slug: 'test-community' }) }),
    ).rejects.toThrow('not found')
  })

  it('calls notFound when community not found', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue(null)

    await expect(
      CommunityModlogPage({ params: Promise.resolve({ slug: 'missing-community' }) }),
    ).rejects.toThrow('not found')
  })
})
