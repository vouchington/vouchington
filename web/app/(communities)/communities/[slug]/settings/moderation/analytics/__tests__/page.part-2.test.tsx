import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApiError } from '@/lib/api/error'
import {
  dashboardMock,
  getCommunityMock,
  getCommunityModerationAnalyticsMock,
  getCommunityModerationTransparencyMock,
  getCurrentUserMock,
  makeUser,
  notFoundMock,
  redirectMock,
  renderModerationAnalyticsPage,
  resetModerationAnalyticsPageMocks,
  transparencyPanelMock,
} from '@/test-helpers/app/communities/community-moderation-analytics-page.mock-support'
import { generateMetadata } from '../page'

describe('CommunityModerationAnalyticsPage site moderator fallback', () => {
  beforeEach(() => {
    resetModerationAnalyticsPageMocks()
  })

  it('allows site moderators and defaults invalid ranges', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser(['moderator']))
    getCommunityMock.mockResolvedValueOnce(null)

    render(await renderModerationAnalyticsPage({ range: 'not-a-range' }))

    expect(getCommunityModerationAnalyticsMock).toHaveBeenCalledWith('test-community', {
      range: '30d',
    })
    expect(dashboardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('test-community moderation queue'),
      }),
      undefined,
    )
  })

  it('returns not found when analytics authorization fails for site moderators', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser(['moderator']))
    getCommunityMock.mockResolvedValueOnce(null)
    getCommunityModerationAnalyticsMock.mockRejectedValueOnce(new ApiError('Not found', 404))

    await expect(renderModerationAnalyticsPage()).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('keeps site-staff raw analytics and renders the paid lock after a transparency 403', async () => {
    getCurrentUserMock.mockResolvedValue(makeUser(['moderator']))
    getCommunityMock.mockResolvedValueOnce(null)
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))

    render(await renderModerationAnalyticsPage())

    expect(screen.getByTestId('dashboard')).toBeDefined()
    expect(transparencyPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({ transparency: null }),
      undefined,
    )
  })

  it('denies raw analytics after a community moderator loses transparency access', async () => {
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))

    await expect(renderModerationAnalyticsPage()).rejects.toThrow('NOT_FOUND')

    expect(notFoundMock).toHaveBeenCalled()
    expect(dashboardMock).not.toHaveBeenCalled()
    expect(transparencyPanelMock).not.toHaveBeenCalled()
  })

  it('redirects when supplementary transparency reports that the session expired', async () => {
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(
      new ApiError('Unauthenticated', 401),
    )

    await expect(renderModerationAnalyticsPage({ range: '7d' })).rejects.toThrow('REDIRECT')

    expect(redirectMock).toHaveBeenCalledWith(
      '/login?next=%2Fcommunities%2Ftest-community%2Fsettings%2Fmoderation%2Fanalytics%3Frange%3D7d',
    )
    expect(dashboardMock).not.toHaveBeenCalled()
    expect(transparencyPanelMock).not.toHaveBeenCalled()
  })

  it('redirects when raw analytics reports that the session expired', async () => {
    getCommunityModerationAnalyticsMock.mockRejectedValueOnce(new ApiError('Unauthenticated', 401))
    getCommunityModerationTransparencyMock.mockRejectedValueOnce(new ApiError('Forbidden', 403))

    await expect(renderModerationAnalyticsPage({ range: '7d' })).rejects.toThrow('REDIRECT')

    expect(redirectMock).toHaveBeenCalledWith(
      '/login?next=%2Fcommunities%2Ftest-community%2Fsettings%2Fmoderation%2Fanalytics%3Frange%3D7d',
    )
    expect(dashboardMock).not.toHaveBeenCalled()
  })

  it('creates community metadata and returns empty metadata for missing communities', async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: 'test-community' }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toEqual({ title: 'Moderation Analytics — Test Community' })

    getCommunityMock.mockResolvedValueOnce(null)
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: 'missing' }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toEqual({})
  })
})
