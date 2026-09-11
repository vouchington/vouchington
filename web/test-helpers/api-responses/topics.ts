import type {
  RecommendedTopicsResponseBody,
  TopicMutationResponseBody,
  TopicsResponseBody,
} from '@/types/api-responses'
import type { Topic } from '@/types/topics'
import type { TopicsSearchResponseBody } from '@/lib/api/client/topics'

import { loadWebApiFixture } from './fixture-loader'

export function makeTopic(overrides: Partial<Topic> = {}): Topic {
  const fixture = loadWebApiFixture('web.topics.mutation.default')
  return {
    ...fixture.topic,
    ...overrides,
  }
}

export function makeTopicsSearchResponse({
  topics = [makeTopic()],
  topicsMetrics,
  pageInfo = { has_next_page: false, start_cursor: null, end_cursor: null },
}: {
  topics?: Topic[]
  topicsMetrics?: TopicsResponseBody['topics_metrics']
  pageInfo?: TopicsResponseBody['page_info']
} = {}): TopicsSearchResponseBody {
  return {
    results: topics.map(topic => ({
      __entity_type: 'topic',
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      topic_type: topic.topic_type,
    })),
    page_info: pageInfo,
    topics: Object.fromEntries(topics.map(topic => [topic.id, topic])),
    topics_metrics: topicsMetrics ?? {},
    election_votes: {},
  }
}

export function makeTopicMutationResponse({
  topic = makeTopic(),
}: {
  topic?: Topic
} = {}): TopicMutationResponseBody {
  return { topic }
}

export function makeRecommendedTopicsResponse({
  topics = [makeTopic()],
}: {
  topics?: Topic[]
} = {}): RecommendedTopicsResponseBody {
  return {
    results: topics.map(topic => ({
      __entity_type: 'topic' as const,
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      topic_type: topic.topic_type,
      score: 1,
      reason: 'test',
    })),
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    topics: Object.fromEntries(topics.map(topic => [topic.id, topic])),
    topics_metrics: {},
  }
}
