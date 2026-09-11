import { describe, expect, it, beforeEach } from 'vitest'
import {
  mockGetCurrentUser,
  mockIsAdmin,
  mockGetCommunity,
  mockNotFound,
  mockRedirect,
  makeUser,
  makeCommunityData,
  resetModerationPageMocks,
} from '@/test-helpers/components/community-moderation-page-test-helpers'
import { resetCommunityModerationModmailMocks } from '@/test-helpers/components/community-moderation-modmail-test-helper'

import CommunityModerationPage from '../page'

describe('CommunityModerationPage access control', () => {
  beforeEach(() => {
    resetModerationPageMocks()
    resetCommunityModerationModmailMocks()
  })

  it('redirects to /login when user is not logged in', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    await expect(
      CommunityModerationPage({
        params: Promise.resolve({ slug: 'test-community' }),
      }),
    ).rejects.toThrow('REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('calls notFound when community is not found', async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser())
    mockGetCommunity.mockResolvedValueOnce(null)
    mockIsAdmin.mockReturnValue(false)

    await expect(
      CommunityModerationPage({
        params: Promise.resolve({ slug: 'test-community' }),
      }),
    ).rejects.toThrow('NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('calls notFound when user is not an admin, owner, or moderator', async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser())
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData('member'))
    mockIsAdmin.mockReturnValue(false)

    await expect(
      CommunityModerationPage({
        params: Promise.resolve({ slug: 'test-community' }),
      }),
    ).rejects.toThrow('NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('calls notFound when membership role is removed', async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser())
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData('moderator', '2026-01-01T00:00:00Z'))
    mockIsAdmin.mockReturnValue(false)

    await expect(
      CommunityModerationPage({
        params: Promise.resolve({ slug: 'test-community' }),
      }),
    ).rejects.toThrow('NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
