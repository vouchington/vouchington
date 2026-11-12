import { topic } from './data.mts'
import { topicElection } from './election-data.mts'
import { topicMetricsWithViewerCount } from './topic-metrics-data.mts'
import type { ApiFixtureCase } from './types.mts'

const lowerBoundBody = {
  topic: { ...topic, logo_image_placement: null, hero_image_placement: null },
  html: '',
  topic_metrics: {
    ...topicMetricsWithViewerCount,
    count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
    viewer_count: { discussions: 0, reviews: 0, 'data-points': 0 },
    viewer_count_capped: { discussions: true, reviews: false, 'data-points': false },
  },
  topic_election: topicElection,
  topic_categories: [],
  topic_parents: [],
  topic_children: [],
  topic_content_update: null,
  election_vote: null,
}

export const webTopicViewerCountApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.topics.show.viewer-lower-bound',
    method: 'GET',
    path: '/api/v1/topics/test-topic',
    route: { routeTemplate: '/api/v1/topics/:idOrSlug', pathParams: { idOrSlug: 'test-topic' } },
    auth: 'fixture-user',
    status: 200,
    body: lowerBoundBody,
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/services/topics/metrics.mts'],
  },
  {
    id: 'web.topics.show.viewer-review-data-lower-bound',
    method: 'GET',
    path: '/api/v1/topics/test-topic',
    route: { routeTemplate: '/api/v1/topics/:idOrSlug', pathParams: { idOrSlug: 'test-topic' } },
    auth: 'fixture-user',
    status: 200,
    body: {
      ...lowerBoundBody,
      topic_metrics: {
        ...lowerBoundBody.topic_metrics,
        viewer_count_capped: { discussions: false, reviews: true, 'data-points': true },
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/services/topics/metrics.mts'],
  },
]
