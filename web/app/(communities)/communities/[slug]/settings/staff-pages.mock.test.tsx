import '@/test-helpers/i18n/mock-json-messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCommunity, makeCommunityResponse } from '@/test-helpers/api-responses/communities'
import type { CommunityMember } from '@/types/api-responses'
import ApplicationsPage from './applications/page'
import InvitesPage from './invites/page'
import PinnedPostsPage from './pinned-posts/page'

const getCurrentUserMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityApplicationsMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityInvitesMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityPostsMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityPinnedPostsMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: getCurrentUserMock,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: getCommunityMock,
  getCommunityApplications: getCommunityApplicationsMock,
  getCommunityInvites: getCommunityInvitesMock,
  getCommunityPosts: getCommunityPostsMock,
  getCommunityPinnedPosts: getCommunityPinnedPostsMock,
}))

vi.mock(import('next/navigation'), () => ({
  notFound: () => {
    throw new Error('not found')
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))

const community = makeCommunity()
const params = { params: Promise.resolve({ slug: community.slug }) }

const ownerMembership = {
  __entity_type: 'community_member',
  id: 'member-1',
  community_id: community.id,
  user_id: 'user-1',
  role: 'owner',
  approved_by_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  removed_at: null,
  removed_by_id: null,
} satisfies CommunityMember

describe('community staff settings pages', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset()
    getCommunityMock.mockReset()
    getCommunityApplicationsMock.mockReset()
    getCommunityInvitesMock.mockReset()
    getCommunityPostsMock.mockReset()
    getCommunityPinnedPostsMock.mockReset()
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    getCommunityMock.mockResolvedValue(
      makeCommunityResponse({ community, membership: ownerMembership }),
    )
    getCommunityApplicationsMock.mockResolvedValue({})
    getCommunityInvitesMock.mockResolvedValue({})
    getCommunityPostsMock.mockResolvedValue({})
    getCommunityPinnedPostsMock.mockResolvedValue({ pinned_posts: [] })
  })

  it('loads applications for staff', async () => {
    await ApplicationsPage(params)

    expect(getCommunityApplicationsMock).toHaveBeenCalledWith(community.slug)
  })

  it('loads invites for staff', async () => {
    await InvitesPage(params)

    expect(getCommunityInvitesMock).toHaveBeenCalledWith(community.slug)
  })

  it('loads pinned posts for staff', async () => {
    await PinnedPostsPage(params)

    expect(getCommunityPinnedPostsMock).toHaveBeenCalledWith(community.slug)
  })

  it.each([
    ['applications', ApplicationsPage, getCommunityApplicationsMock],
    ['invites', InvitesPage, getCommunityInvitesMock],
    ['pinned posts', PinnedPostsPage, getCommunityPinnedPostsMock],
  ])('does not load %s data for a signed-out visitor', async (_name, page, fetcher) => {
    getCurrentUserMock.mockResolvedValue(null)

    await expect(page(params)).rejects.toThrow('redirect:/login')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
