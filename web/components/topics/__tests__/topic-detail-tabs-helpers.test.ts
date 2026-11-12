import { describe, expect, it } from 'vitest'
import { pushPostTab, type TopicDetailTab } from '../topic-detail-tabs-helpers'

describe('topic tab lower bounds', () => {
  it('retains the plus when public and viewer counts are equal but capped', () => {
    const tabs: TopicDetailTab[] = []
    pushPostTab(
      tabs,
      {
        count: { discussions: 0, reviews: 1, 'data-points': 0, news: 0, latest: 0 },
        viewer_count: { discussions: 0, reviews: 1, 'data-points': 0 },
        viewer_count_capped: { discussions: false, reviews: true, 'data-points': false },
      },
      {
        countKey: 'reviews',
        label: 'Reviews',
        name: 'reviews',
        path: '/topic/reviews',
        isActive: false,
      },
    )
    expect(tabs).toEqual([{ name: 'reviews', label: 'Reviews (1+)', path: '/topic/reviews' }])
  })
  it('keeps a zero lower-bound tab visible with its plus marker', () => {
    const tabs: TopicDetailTab[] = []
    pushPostTab(
      tabs,
      {
        count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
        viewer_count: { discussions: 0, reviews: 0, 'data-points': 0 },
        viewer_count_capped: { discussions: false, reviews: true, 'data-points': false },
      },
      {
        countKey: 'reviews',
        label: 'Reviews',
        name: 'reviews',
        path: '/topic/reviews',
        isActive: false,
      },
    )
    expect(tabs).toEqual([{ name: 'reviews', label: 'Reviews (0+)', path: '/topic/reviews' }])
  })
})
