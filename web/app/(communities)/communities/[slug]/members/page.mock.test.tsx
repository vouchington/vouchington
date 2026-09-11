import { beforeEach, describe, expect, it, vi } from 'vitest'
import CommunityMembersPage from './page'

const { mockGetCommunity, mockGetCommunityMembers } = vi.hoisted(() => ({
  mockGetCommunity: vi.fn<VitestLooseMock>(),
  mockGetCommunityMembers: vi.fn<VitestLooseMock>(),
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
  getCommunityMembers: mockGetCommunityMembers,
}))

vi.mock(import('@/components/communities/community-members-manager'), () => ({
  CommunityMembersManager: () => <div>members manager</div>,
}))

const communityData = {
  community: { id: 'community-1', name: 'Rewards', slug: 'rewards' },
  membership: null,
}
const membersData = { results: [], page_info: { has_next_page: false } }

describe('CommunityMembersPage', () => {
  beforeEach(() => {
    mockGetCommunity.mockReset()
    mockGetCommunityMembers.mockReset()
    mockGetCommunity.mockResolvedValue(communityData)
    mockGetCommunityMembers.mockResolvedValue(membersData)
  })

  it('renders the members page', async () => {
    const result = await CommunityMembersPage({ params: Promise.resolve({ slug: 'rewards' }) })
    expect(result).toBeTruthy()
    expect(mockGetCommunityMembers).toHaveBeenCalled()
  })

  it('calls notFound when has_pending_application is true', async () => {
    mockGetCommunity.mockResolvedValue({ ...communityData, has_pending_application: true })
    await expect(
      CommunityMembersPage({ params: Promise.resolve({ slug: 'rewards' }) }),
    ).rejects.toThrow('notFound')
    expect(mockGetCommunityMembers).not.toHaveBeenCalled()
  })
})
