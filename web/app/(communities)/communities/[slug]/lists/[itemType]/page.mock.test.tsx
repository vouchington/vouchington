import { beforeEach, describe, expect, it, vi } from 'vitest'
import CommunityListItemTypePage from './page'

const {
  mockGetCommunity,
  mockGetCommunityListRssFeeds,
  mockGetCommunityListTopics,
  mockGetCurrentUser,
} = vi.hoisted(() => ({
  mockGetCommunity: vi.fn<VitestLooseMock>(),
  mockGetCommunityListRssFeeds: vi.fn<VitestLooseMock>(),
  mockGetCommunityListTopics: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: vi.fn<VitestLooseMock>(() => {
        throw new Error('notFound')
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: mockGetCommunity,
  getCommunityListTopics: mockGetCommunityListTopics,
  getCommunityListRssFeeds: mockGetCommunityListRssFeeds,
  getCommunityListPosts: vi.fn<VitestLooseMock>(),
  getCommunityListDomains: vi.fn<VitestLooseMock>(),
  getCommunityListUrls: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/components/communities/community-list-items-list'), () => ({
  CommunityListItemsList: () => <div>list items</div>,
}))

vi.mock(
  import('@/components/communities/add-community-list-item-form'),
  () =>
    ({
      AddCommunityListItemForm: () => null,
    }) as unknown as typeof import('@/components/communities/add-community-list-item-form'),
)

const communityData = {
  community: { id: 'community-1', name: 'Rewards', slug: 'rewards' },
  membership: null,
}
const topicsData = { results: [], page_info: { has_next_page: false } }

describe('CommunityListItemTypePage', () => {
  beforeEach(() => {
    mockGetCommunity.mockReset()
    mockGetCommunityListRssFeeds.mockReset()
    mockGetCommunityListTopics.mockReset()
    mockGetCurrentUser.mockReset()
    mockGetCommunity.mockResolvedValue(communityData)
    mockGetCommunityListRssFeeds.mockResolvedValue(topicsData)
    mockGetCommunityListTopics.mockResolvedValue(topicsData)
    mockGetCurrentUser.mockResolvedValue(null)
  })

  it('renders the list items page', async () => {
    const result = await CommunityListItemTypePage({
      params: Promise.resolve({ slug: 'rewards', itemType: 'topics' }),
    })
    expect(result).toBeTruthy()
    expect(mockGetCommunityListTopics).toHaveBeenCalled()
  })

  it('maps feeds route segment to rss_feed list config', async () => {
    const result = await CommunityListItemTypePage({
      params: Promise.resolve({ slug: 'rewards', itemType: 'feeds' }),
    })
    expect(result).toBeTruthy()
    expect(mockGetCommunityListRssFeeds).toHaveBeenCalledWith('rewards')
  })

  it('calls notFound when has_pending_application is true', async () => {
    mockGetCommunity.mockResolvedValue({ ...communityData, has_pending_application: true })
    await expect(
      CommunityListItemTypePage({
        params: Promise.resolve({ slug: 'rewards', itemType: 'topics' }),
      }),
    ).rejects.toThrow('notFound')
    expect(mockGetCommunityListTopics).not.toHaveBeenCalled()
  })
})
