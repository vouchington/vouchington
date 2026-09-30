import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApiError } from '@/lib/api/error'
import {
  dashboardMock,
  getCommunityMock,
  getCommunityModerationAnalyticsMock,
  getCommunityModerationTransparencyMock,
  getCurrentUserMock,
  makeCommunityData,
  makeTransparency,
  notFoundMock,
  rangeFilterMock,
  redirectMock,
  renderModerationAnalyticsPage,
  resetModerationAnalyticsPageMocks,
  transparencyPanelMock,
} from '@/test-helpers/app/communities/community-moderation-analytics-page.mock-support'

vi.mock(import('@/components/admin/moderation-analytics/moderation-analytics-dashboard'), () => ({
  default: dashboardMock,
}))

describe('CommunityModerationAnalyticsPage', () => {
  beforeEach(() => {
    resetModerationAnalyticsPageMocks()
  })

  it('redirects anonymous users to login with the requested range', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    await expect(renderModerationAnalyticsPage({ range: '90d' })).rejects.toThrow('REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith(
      '/login?next=%2Fcommunities%2Ftest-community%2Fsettings%2Fmoderation%2Fanalytics%3Frange%3D90d',
    )
  })

  it('returns not found when the community is missing', async () => {
    getCommunityMock.mockResolvedValueOnce(null)

    await expect(renderModerationAnalyticsPage()).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('renders only paid aggregate transparency for a regular community member', async () => {
    getCommunityMock.mockResolvedValueOnce(makeCommunityData('member'))
    const transparency = makeTransparency()
    getCommunityModerationTransparencyMock.mockResolvedValueOnce(transparency)

    render(await renderModerationAnalyticsPage())

    expect(getCommunityModerationAnalyticsMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('dashboard')).toBeNull()
    expect(screen.getByTestId('transparency-panel')).toBeDefined()
    expect(transparencyPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({ transparency, showTitle: false }),
      undefined,
    )
    expect(rangeFilterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: '/communities/test-community/settings/moderation/analytics',
        range: '30d',
        todayLabelKey:
          'extracted.moderationAnalytics.moderationTransparencyPanel.latestReleasedDay_2a9e5b31',
      }),
      undefined,
    )
  })

  it('renders dashboard props for community moderators', async () => {
    const page = await renderModerationAnalyticsPage({ range: '90d' })
    render(page)

    expect(getCommunityModerationAnalyticsMock).toHaveBeenCalledWith('test-community', {
      range: '90d',
    })
    expect(getCommunityModerationTransparencyMock).toHaveBeenCalledWith('test-community', {
      range: '90d',
    })
    expect(screen.getByTestId('dashboard')).toBeDefined()
    expect(screen.getByTestId('transparency-panel')).toBeDefined()
    expect(dashboardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: '/communities/test-community/settings/moderation/analytics',
        title: 'Moderation Analytics',
        description: expect.stringContaining('Test Community moderation queue'),
      }),
      undefined,
    )
  })

  it.each([new ApiError('Unavailable', 500), new Error('network unavailable')])(
    'keeps raw analytics and omits the paid lock when supplementary transparency is transiently unavailable',
    async error => {
      getCommunityModerationTransparencyMock.mockRejectedValueOnce(error)

      render(await renderModerationAnalyticsPage())

      expect(screen.getByTestId('dashboard')).toBeDefined()
      expect(transparencyPanelMock).not.toHaveBeenCalled()
    },
  )

  it('returns not found when the community disappears before supplementary transparency loads', async () => {
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Not found', 404))

    await expect(renderModerationAnalyticsPage()).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('redirects a paid member when the transparency session expires', async () => {
    getCommunityMock.mockResolvedValueOnce(makeCommunityData('member'))
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(
      new ApiError('Unauthenticated', 401),
    )

    await expect(renderModerationAnalyticsPage({ range: '7d' })).rejects.toThrow('REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith(
      '/login?next=%2Fcommunities%2Ftest-community%2Fsettings%2Fmoderation%2Fanalytics%3Frange%3D7d',
    )
  })

  it('returns not found when a paid member community disappears', async () => {
    getCommunityMock.mockResolvedValueOnce(makeCommunityData('member'))
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Not found', 404))

    await expect(renderModerationAnalyticsPage()).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('renders the paid lock when a member lacks an active paid entitlement', async () => {
    getCommunityMock.mockResolvedValueOnce(makeCommunityData('member'))
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))

    render(await renderModerationAnalyticsPage())

    expect(transparencyPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({ transparency: null, showTitle: false }),
      undefined,
    )
  })
})
