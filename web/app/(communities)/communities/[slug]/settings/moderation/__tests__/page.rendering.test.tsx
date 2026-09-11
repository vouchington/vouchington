import { describe, expect, it, beforeEach } from 'vitest'
import { configure, render, screen } from '@testing-library/react'
import {
  mockGetCurrentUser,
  mockIsAdmin,
  mockIsModerationStaff,
  mockCommunityAutomodReviewPanel,
  mockGetCommunity,
  mockGetCommunityAutomodRecentActions,
  mockGetCommunityPendingModerationReports,
  makeUser,
  makeCommunityData,
  defaultAutomodActions,
  resetModerationPageMocks,
} from '@/test-helpers/components/community-moderation-page-test-helpers'
import {
  mockGetModmailInboxServer,
  resetCommunityModerationModmailMocks,
} from '@/test-helpers/components/community-moderation-modmail-test-helper'

import CommunityModerationPage from '../page'

configure({ testIdAttribute: 'data-pw' })

describe('CommunityModerationPage rendering', () => {
  beforeEach(() => {
    resetModerationPageMocks()
    resetCommunityModerationModmailMocks()
  })

  it('renders the moderation page for a moderator and calls isModerationStaff', async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser())
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData('moderator'))
    mockIsAdmin.mockReturnValue(false)
    mockIsModerationStaff.mockReturnValue(false)

    const jsx = await CommunityModerationPage({
      params: Promise.resolve({ slug: 'test-community' }),
    })
    render(jsx)

    expect(mockIsModerationStaff).toHaveBeenCalled()
    expect(mockGetCommunityAutomodRecentActions).toHaveBeenCalledWith('test-community', {
      searchParams: { window: '48h', limit: 10 },
    })
    expect(mockCommunityAutomodReviewPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: defaultAutomodActions.automod_actions,
        communitySlug: 'test-community',
        stats: defaultAutomodActions.stats,
      }),
      undefined,
    )
    expect(mockGetModmailInboxServer).toHaveBeenCalledWith('test-community')
    expect(screen.getByTestId('modmail-inbox')).toHaveTextContent('modmail-inbox:1')
  })

  it('passes an explicit failure state when the server-rendered inbox request fails', async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser())
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData('moderator'))
    mockIsAdmin.mockReturnValue(false)
    mockIsModerationStaff.mockReturnValue(false)
    mockGetModmailInboxServer.mockRejectedValueOnce(new Error('network failure'))

    const jsx = await CommunityModerationPage({
      params: Promise.resolve({ slug: 'test-community' }),
    })
    render(jsx)

    expect(screen.getByTestId('modmail-inbox')).toHaveTextContent('modmail-inbox:error')
  })

  it.each([
    ['site admin', null, true, true],
    ['community owner', 'owner', false, false],
  ])('renders the moderation page for a %s', async (_label, role, admin, staff) => {
    mockGetCurrentUser.mockResolvedValue(makeUser())
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData(role))
    mockIsAdmin.mockReturnValue(admin)
    mockIsModerationStaff.mockReturnValue(staff)

    const jsx = await CommunityModerationPage({
      params: Promise.resolve({ slug: 'test-community' }),
    })
    render(jsx)

    expect(screen.getByText('mod-queue')).toBeDefined()
  })

  it('passes a valid report sort to the moderation queue fetch and component', async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser())
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData('owner'))
    mockIsAdmin.mockReturnValue(false)
    mockIsModerationStaff.mockReturnValue(false)

    const jsx = await CommunityModerationPage({
      params: Promise.resolve({ slug: 'test-community' }),
      searchParams: Promise.resolve({ reportSort: 'most_reported' }),
    })
    render(jsx)

    expect(mockGetCommunityPendingModerationReports).toHaveBeenCalledWith('test-community', {
      searchParams: { sort: 'most_reported' },
    })
    expect(screen.getByTestId('mod-queue')).toHaveTextContent('sort:most_reported')
  })

  it('falls back to newest-first for non-staff invalid report sort values', async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser())
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData('owner'))
    mockIsAdmin.mockReturnValue(false)
    mockIsModerationStaff.mockReturnValue(false)

    const jsx = await CommunityModerationPage({
      params: Promise.resolve({ slug: 'test-community' }),
      searchParams: Promise.resolve({ reportSort: 'newest' }),
    })
    render(jsx)

    expect(mockGetCommunityPendingModerationReports).toHaveBeenCalledWith('test-community', {
      searchParams: { sort: 'created_at_desc' },
    })
    expect(screen.getByTestId('mod-queue')).toHaveTextContent('sort:created_at_desc')
  })

  it('marks a valid URL-selected moderation tab as explicit', async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser())
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData('owner'))
    mockIsAdmin.mockReturnValue(false)
    mockIsModerationStaff.mockReturnValue(false)

    const jsx = await CommunityModerationPage({
      params: Promise.resolve({ slug: 'test-community' }),
      searchParams: Promise.resolve({ tab: 'posts' }),
    })
    render(jsx)

    expect(screen.getByTestId('mod-queue')).toHaveTextContent('tab:posts')
    expect(screen.getByTestId('mod-queue')).toHaveTextContent('explicit:true')
  })
})
