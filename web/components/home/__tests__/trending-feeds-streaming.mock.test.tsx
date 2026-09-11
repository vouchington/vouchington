import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrendingFeedsStreaming } from '../trending-feeds-streaming'
import type { TrendingFeedsViewModel } from '@/lib/view-models/homepage-view-models'

const resolvedData = vi.hoisted((): TrendingFeedsViewModel => [
  { id: 'feed-1', title: 'Feed', displayName: 'Feed', href: '/feeds/feed' },
])

vi.mock(import('../trending-feeds'), () => ({
  TrendingFeeds: ({ data }: { data: TrendingFeedsViewModel | null }) => (
    <div data-testid='trending-feeds'>{data?.length ?? 0}</div>
  ),
}))

vi.mock(import('@/components/shared/follow-button'), () => ({
  FollowButton: () => <button type='button'>Follow</button>,
}))

describe('TrendingFeedsStreaming', () => {
  it('unwraps the data promise and renders TrendingFeeds', async () => {
    const dataPromise = Promise.resolve(resolvedData)

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading</div>}>
          <TrendingFeedsStreaming dataPromise={dataPromise} />
        </Suspense>,
      )
      await dataPromise
    })

    expect(screen.getByTestId('trending-feeds')).toHaveTextContent('1')
  })
})
