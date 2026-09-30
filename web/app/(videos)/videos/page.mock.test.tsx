import {
  mockGetRssFeedItems,
  resetFeedPageDoubles,
} from '@/test-helpers/app/feed-page.mock-support'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/feature-flags/server'), () => ({
  getEffectiveServerFeatureFlag: vi.fn<VitestLooseMock>().mockResolvedValue(false),
}))

import VideosPage from './page'

describe('VideosPage', () => {
  beforeEach(() => {
    resetFeedPageDoubles()
  })

  it('renders the page header', async () => {
    const ui = await VideosPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('Videos')).toBeDefined()
  })

  it('calls getRssFeedItems with media_type=video', async () => {
    await VideosPage({ searchParams: Promise.resolve({}) })
    expect(mockGetRssFeedItems).toHaveBeenCalledWith({
      searchParams: expect.objectContaining({ media_type: 'video' }),
    })
  })

  it('renders the feed view toggle', async () => {
    const ui = await VideosPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('feed view toggle')).toBeDefined()
  })
})
