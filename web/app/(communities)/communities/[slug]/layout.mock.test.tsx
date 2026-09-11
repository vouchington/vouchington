import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notFound } from 'next/navigation'
import { ApiError } from '@/lib/api/error'
import CommunityLayout from './layout'

const {
  mockGetCommunity,
  mockGetCommunityListItemCounts,
  mockGetCommunityMembers,
  mockGetCurrentUser,
} = vi.hoisted(() => ({
  mockGetCommunity: vi.fn<VitestLooseMock>(),
  mockGetCommunityListItemCounts: vi.fn<VitestLooseMock>(),
  mockGetCommunityMembers: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('next/navigation'), () => ({
  notFound: vi.fn<() => never>(() => {
    throw new Error('notFound')
  }),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: mockGetCommunity,
  getCommunityListItemCounts: mockGetCommunityListItemCounts,
  getCommunityMembers: mockGetCommunityMembers,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/i18n/get-resolved-ui-locale'), () => ({
  getResolvedUiLocale: vi.fn<VitestLooseMock>(() => Promise.resolve('en')),
}))

vi.mock(import('@/components/communities/community-header'), () => ({
  CommunityHeader: () => <div>community header</div>,
}))

vi.mock(import('@/components/communities/community-nav'), () => ({
  CommunityNav: () => <div>community nav</div>,
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const communityData = {
  community: {
    id: 'community-1',
    name: 'Rewards',
    slug: 'rewards',
    markdown: null,
    visibility: 'public',
  },
  user: null,
  community_metrics: null,
  membership: null,
}

describe('CommunityLayout', () => {
  beforeEach(() => {
    mockGetCommunity.mockReset()
    mockGetCommunityListItemCounts.mockReset()
    mockGetCommunityMembers.mockReset()
    mockGetCurrentUser.mockReset()
    mockGetCommunity.mockResolvedValue(communityData)
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetCommunityMembers.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      community_members: {},
      users: {},
    })
  })

  it('does not swallow unexpected list count failures', async () => {
    const error = new ApiError('upstream failed', 500)
    mockGetCommunityListItemCounts.mockRejectedValue(error)

    await expect(
      CommunityLayout({
        params: Promise.resolve({ slug: 'rewards' }),
        children: <div>child</div>,
      }),
    ).rejects.toBe(error)
  })

  it('renders the layout once the community exists', async () => {
    mockGetCommunityListItemCounts.mockResolvedValue({ topic: 1, rss_feed: 0 })

    const result = await CommunityLayout({
      params: Promise.resolve({ slug: 'rewards' }),
      children: <div>child</div>,
    })

    expect(result).toBeDefined()
    expect(mockGetCommunityMembers).toHaveBeenCalledTimes(2)
  })

  it('returns notFound before loading members when the community is missing', async () => {
    mockGetCommunity.mockResolvedValueOnce(null)

    await expect(
      CommunityLayout({
        params: Promise.resolve({ slug: 'missing' }),
        children: <div>child</div>,
      }),
    ).rejects.toThrow('notFound')

    expect(notFound).toHaveBeenCalledOnce()
    expect(mockGetCommunityListItemCounts).not.toHaveBeenCalled()
    expect(mockGetCommunityMembers).not.toHaveBeenCalled()
  })

  it('allows site moderators through when a private community is hidden from the public API', async () => {
    mockGetCommunity.mockResolvedValueOnce(null)
    mockGetCurrentUser.mockResolvedValueOnce({ id: 'staff-1', roles: ['moderator'] })

    const result = await CommunityLayout({
      params: Promise.resolve({ slug: 'private-rewards' }),
      children: <div>analytics child</div>,
    })

    expect(result).toBeDefined()
    expect(mockGetCommunityListItemCounts).not.toHaveBeenCalled()
    expect(mockGetCommunityMembers).not.toHaveBeenCalled()
  })
})
