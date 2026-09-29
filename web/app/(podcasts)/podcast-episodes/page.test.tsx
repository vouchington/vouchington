import {
  mockGetRssFeedItems,
  resetFeedPageDoubles,
} from '@/test-helpers/app/feed-page.mock-support'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import PodcastEpisodesPage from './page'

describe('PodcastEpisodesPage', () => {
  beforeEach(() => {
    resetFeedPageDoubles()
  })

  it('renders the page header', async () => {
    const ui = await PodcastEpisodesPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('Podcast Episodes')).toBeDefined()
  })

  it('calls getRssFeedItems with media_type=audio', async () => {
    await PodcastEpisodesPage({ searchParams: Promise.resolve({}) })
    expect(mockGetRssFeedItems).toHaveBeenCalledWith({
      searchParams: expect.objectContaining({ media_type: 'audio' }),
    })
  })

  it('renders the feed view toggle', async () => {
    const ui = await PodcastEpisodesPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('feed view toggle')).toBeDefined()
  })
})
