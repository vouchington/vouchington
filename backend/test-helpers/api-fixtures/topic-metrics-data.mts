import { topic } from './data.mts'

export const topicMetrics = {
  __entity_type: 'topic_metrics',
  id: topic.id,
  count: {
    discussions: 1,
    reviews: 0,
    'data-points': 0,
    news: 0,
    latest: 1,
  },
  ratings: {
    count: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  },
  ratings__updated_at: '2026-01-01T00:00:00Z',
  bookmarks: { follow: 0 },
  bookmarks__updated_at: '2026-01-01T00:00:00Z',
}

export const topicMetricsWithViewerCount = {
  ...topicMetrics,
  viewer_count: {
    discussions: 1,
    reviews: 0,
    'data-points': 0,
  },
}
