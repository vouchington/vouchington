import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('@/components/shared/follow-button'), () => ({
  FollowButton: () => <button type='button'>Follow</button>,
}))

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))

import { TrendingFeeds } from '../trending-feeds'

describe('TrendingFeeds', () => {
  it('renders the empty state when no feeds are available', () => {
    render(<TrendingFeeds data={null} />)

    expect(
      screen.getByText('extracted.home.trendingFeeds.noTrendingFeedsRightNow_4c6657bb'),
    ).toBeInTheDocument()
  })

  it('renders a follow control through the lazy follow-button boundary', async () => {
    render(
      <TrendingFeeds
        data={[{ id: 'feed-1', title: 'Feed', displayName: 'Example', href: '/feeds/feed-1' }]}
      />,
    )

    expect(await screen.findByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })
})
