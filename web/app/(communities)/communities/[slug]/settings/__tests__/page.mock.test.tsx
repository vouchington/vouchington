import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommunitySettingsPage from '../page'

interface HeaderBag {
  get: (key: string) => string | null
}

const getCurrentUserMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const notFoundMock = vi.hoisted(() => vi.fn<() => never>())
const redirectMock = vi.hoisted(() => vi.fn<(path: string) => never>())
const createCommunityPathnameMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const headersMock = vi.hoisted(() => vi.fn<() => Promise<HeaderBag>>())

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: getCurrentUserMock,
}))

vi.mock(
  import('next/headers'),
  () =>
    ({
      headers: headersMock,
    }) as unknown as typeof import('next/headers'),
)

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: getCommunityMock,
}))

vi.mock(import('next/navigation'), () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(import('@/lib/links/entity-href'), () => ({
  createCommunityPathname: createCommunityPathnameMock,
}))

vi.mock(import('@/components/communities/community-settings-form'), () => ({
  CommunitySettingsForm: ({ community }: { community: { name: string } }) => (
    <div
      data-testid='community-settings-form'
      data-community={community.name}
    >
      Settings form
    </div>
  ),
}))

const mockUser = {
  id: 'user-1',
  username: 'owner',
  roles: [],
}

const mockCommunityData = {
  community: { id: 'community-1', name: 'Test Community', slug: 'test-community' },
  membership: { user_id: 'user-1', community_id: 'community-1', role: 'owner', removed_at: null },
}

describe('CommunitySettingsPage', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset()
    getCommunityMock.mockReset()
    notFoundMock.mockReset()
    redirectMock.mockReset()
    createCommunityPathnameMock.mockReset()
    notFoundMock.mockImplementation(() => {
      throw new Error('not found')
    })
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`)
    })
    createCommunityPathnameMock.mockImplementation(
      (slug: string, path: string) => `/communities/${slug}${path}`,
    )
    headersMock.mockResolvedValue({ get: () => null })
  })

  it('renders the settings form for a community owner', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue(mockCommunityData)

    const page = await CommunitySettingsPage({
      params: Promise.resolve({ slug: 'test-community' }),
    })
    render(page as unknown as ReactNode)

    expect(screen.getByTestId('community-settings-form')).toBeDefined()
  })

  it('redirects unauthenticated users to login', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    await expect(
      CommunitySettingsPage({ params: Promise.resolve({ slug: 'test-community' }) }),
    ).rejects.toThrow('redirect:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
  })

  it('calls notFound when community is not found', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue(null)

    await expect(
      CommunitySettingsPage({ params: Promise.resolve({ slug: 'test-community' }) }),
    ).rejects.toThrow('not found')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('redirects moderators to the moderation page', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue({
      ...mockCommunityData,
      membership: { ...mockCommunityData.membership, role: 'moderator' },
    })

    await expect(
      CommunitySettingsPage({ params: Promise.resolve({ slug: 'test-community' }) }),
    ).rejects.toThrow('redirect:/communities/test-community/settings/moderation')
    expect(redirectMock).toHaveBeenCalledWith('/communities/test-community/settings/moderation')
  })

  it('calls notFound for regular members', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue({
      ...mockCommunityData,
      membership: { ...mockCommunityData.membership, role: 'member' },
    })

    await expect(
      CommunitySettingsPage({ params: Promise.resolve({ slug: 'test-community' }) }),
    ).rejects.toThrow('not found')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('calls notFound when membership is removed', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue({
      ...mockCommunityData,
      membership: {
        ...mockCommunityData.membership,
        role: 'moderator',
        removed_at: '2026-01-01T00:00:00Z',
      },
    })

    await expect(
      CommunitySettingsPage({ params: Promise.resolve({ slug: 'test-community' }) }),
    ).rejects.toThrow('not found')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('calls notFound when there is no membership', async () => {
    getCurrentUserMock.mockResolvedValue(mockUser)
    getCommunityMock.mockResolvedValue({
      ...mockCommunityData,
      membership: null,
    })

    await expect(
      CommunitySettingsPage({ params: Promise.resolve({ slug: 'test-community' }) }),
    ).rejects.toThrow('not found')
    expect(notFoundMock).toHaveBeenCalled()
  })
})
