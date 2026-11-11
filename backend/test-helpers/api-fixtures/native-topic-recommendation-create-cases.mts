import type { ApiFixtureCase } from './types.mts'
import { responseBody } from './static-response-bodies.mts'

export const nativeTopicRecommendationCreateApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.posts.topic-recommendation.create',
    method: 'POST',
    path: '/api/v1/posts',
    route: { routeTemplate: '/api/v1/posts' },
    backendResponseContractKey: 'POST:/api/v1/posts#topic-recommendation',
    requestHeaders: { 'Idempotency-Key': '70000000-0000-7000-8000-000000005598' },
    requestBody: {
      post_type: 'topic_recommendation',
      title: 'Native recommendation',
      topic_markdown: 'Recommendation body',
      topic_aliases: ['native topic'],
      markdown: 'Recommendation body',
      topic_title: 'Native Topic',
      topic_slug: 'native-topic',
    },
    auth: 'fixture-user',
    status: 201,
    body: responseBody('native.posts.topic-recommendation.create'),
    consumers: ['swift-core'],
    migratedFrom: ['backend/api/v1/posts/posts-routes/posts-create-post.mts'],
  },
]
