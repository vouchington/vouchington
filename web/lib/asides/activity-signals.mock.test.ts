import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock(import('@/lib/api/server'), () => ({
  getUserProfile: vi.fn<VitestLooseMock>(),
  getMyLandingPages: vi.fn<VitestLooseMock>(),
  getMyCommunities: vi.fn<VitestLooseMock>(),
}))

import { getUserProfile, getMyLandingPages, getMyCommunities } from '@/lib/api/server'
import {
  hasCreatedPost,
  followsAnyTopic,
  followsAnyUser,
  hasLandingPage,
  hasJoinedCommunity,
} from './activity-signals'

const mockGetUserProfile = vi.mocked(getUserProfile)
const mockGetMyLandingPages = vi.mocked(getMyLandingPages)
const mockGetMyCommunities = vi.mocked(getMyCommunities)

const testUser = { id: 'user-1', username: 'testuser', roles: [] } as Parameters<
  typeof hasCreatedPost
>[0]

function makeProfileWithCount(count: {
  reviews?: number
  discussions?: number
  comments?: number
  topics_following?: number
  users_following?: number
}) {
  return {
    user_metrics: {
      count: {
        reviews: count.reviews ?? 0,
        discussions: count.discussions ?? 0,
        comments: count.comments ?? 0,
        topics_following: count.topics_following ?? 0,
        users_following: count.users_following ?? 0,
      },
    },
  } as unknown as Awaited<ReturnType<typeof getUserProfile>>
}

describe('activity-signals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hasCreatedPost', () => {
    it('returns false when profile has no posts', async () => {
      mockGetUserProfile.mockResolvedValue(
        makeProfileWithCount({ reviews: 0, discussions: 0, comments: 0 }),
      )
      expect(await hasCreatedPost(testUser)).toBe(false)
    })

    it('returns true when profile has reviews', async () => {
      mockGetUserProfile.mockResolvedValue(makeProfileWithCount({ reviews: 1 }))
      expect(await hasCreatedPost(testUser)).toBe(true)
    })

    it('returns true when profile has discussions', async () => {
      mockGetUserProfile.mockResolvedValue(makeProfileWithCount({ discussions: 2 }))
      expect(await hasCreatedPost(testUser)).toBe(true)
    })

    it('returns true when profile has comments', async () => {
      mockGetUserProfile.mockResolvedValue(makeProfileWithCount({ comments: 3 }))
      expect(await hasCreatedPost(testUser)).toBe(true)
    })

    it('returns true (hides nudge) on API error', async () => {
      mockGetUserProfile.mockRejectedValue(new Error('api error'))
      expect(await hasCreatedPost(testUser)).toBe(true)
    })

    it('returns false when user has no username', async () => {
      const noUsernameUser = { ...testUser, username: undefined } as Parameters<
        typeof hasCreatedPost
      >[0]
      expect(await hasCreatedPost(noUsernameUser)).toBe(false)
    })

    it('returns false when profile is null', async () => {
      mockGetUserProfile.mockResolvedValue(null)
      expect(await hasCreatedPost(testUser)).toBe(false)
    })
  })

  describe('followsAnyTopic', () => {
    it('returns false when following 0 topics', async () => {
      mockGetUserProfile.mockResolvedValue(makeProfileWithCount({ topics_following: 0 }))
      expect(await followsAnyTopic(testUser)).toBe(false)
    })

    it('returns true when following at least one topic', async () => {
      mockGetUserProfile.mockResolvedValue(makeProfileWithCount({ topics_following: 3 }))
      expect(await followsAnyTopic(testUser)).toBe(true)
    })

    it('returns true (hides nudge) on API error', async () => {
      mockGetUserProfile.mockRejectedValue(new Error('api error'))
      expect(await followsAnyTopic(testUser)).toBe(true)
    })

    it('returns false when user has no username', async () => {
      const noUsernameUser = { ...testUser, username: undefined } as Parameters<
        typeof followsAnyTopic
      >[0]
      expect(await followsAnyTopic(noUsernameUser)).toBe(false)
    })
  })

  describe('followsAnyUser', () => {
    it('returns false when following 0 users', async () => {
      mockGetUserProfile.mockResolvedValue(makeProfileWithCount({ users_following: 0 }))
      expect(await followsAnyUser(testUser)).toBe(false)
    })

    it('returns true when following at least one user', async () => {
      mockGetUserProfile.mockResolvedValue(makeProfileWithCount({ users_following: 1 }))
      expect(await followsAnyUser(testUser)).toBe(true)
    })

    it('returns true (hides nudge) on API error', async () => {
      mockGetUserProfile.mockRejectedValue(new Error('api error'))
      expect(await followsAnyUser(testUser)).toBe(true)
    })

    it('returns false when user has no username', async () => {
      const noUsernameUser = { ...testUser, username: undefined } as Parameters<
        typeof followsAnyUser
      >[0]
      expect(await followsAnyUser(noUsernameUser)).toBe(false)
    })
  })

  describe('hasLandingPage', () => {
    it('returns false when user has no landing pages', async () => {
      mockGetMyLandingPages.mockResolvedValue({ results: [] } as unknown as Awaited<
        ReturnType<typeof getMyLandingPages>
      >)
      expect(await hasLandingPage()).toBe(false)
    })

    it('returns true when user has at least one landing page', async () => {
      mockGetMyLandingPages.mockResolvedValue({ results: [{ id: 'lp-1' }] } as unknown as Awaited<
        ReturnType<typeof getMyLandingPages>
      >)
      expect(await hasLandingPage()).toBe(true)
    })

    it('returns true (hides nudge) on API error', async () => {
      mockGetMyLandingPages.mockRejectedValue(new Error('api error'))
      expect(await hasLandingPage()).toBe(true)
    })
  })

  describe('hasJoinedCommunity', () => {
    it('returns false when user has no memberships', async () => {
      mockGetMyCommunities.mockResolvedValue({ results: [] } as unknown as Awaited<
        ReturnType<typeof getMyCommunities>
      >)
      expect(await hasJoinedCommunity()).toBe(false)
    })

    it('returns true when user has at least one membership', async () => {
      mockGetMyCommunities.mockResolvedValue({ results: [{ id: 'cm-1' }] } as unknown as Awaited<
        ReturnType<typeof getMyCommunities>
      >)
      expect(await hasJoinedCommunity()).toBe(true)
    })

    it('returns true (hides nudge) on API error', async () => {
      mockGetMyCommunities.mockRejectedValue(new Error('api error'))
      expect(await hasJoinedCommunity()).toBe(true)
    })
  })
})
