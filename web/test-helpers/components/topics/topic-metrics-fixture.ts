import type { TopicMetrics } from '@/types/topics'

export function makeMetrics(overrides: Partial<TopicMetrics>): TopicMetrics {
  return {
    __entity_type: 'topic_metrics',
    id: 'topic-1',
    count: {
      discussions: 0,
      reviews: 0,
      'data-points': 0,
      news: 0,
      latest: 0,
    },
    ratings: {
      count: {
        '1': 0,
        '2': 0,
        '3': 0,
        '4': 0,
        '5': 0,
      },
    },
    ratings__updated_at: '2024-01-15T10:00:00Z',
    bookmarks: {
      follow: 0,
    },
    bookmarks__updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}
