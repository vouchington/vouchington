import type {
  TopicRecommendationMutationResponseBody,
  TopHashtagsResponseBody,
} from '@/lib/api/client/topic-recommendations'

export function makeTopicRecommendationMutationResponse(): TopicRecommendationMutationResponseBody {
  return {
    post: {
      id: 'recommendation-1',
      slug: null,
      post_type: 'topic_recommendation',
      title: 'My Recommendation',
      markdown: 'Rationale',
      parent_post_id: null,
      root_post_id: null,
      created_by_id: 'user-1',
      is_anonymous: false,
      created_at: '2026-10-16T00:00:00.000Z',
      updated_at: '2026-10-16T00:00:00.000Z',
      topic_recommendation: {
        post_id: 'recommendation-1',
        topic_title: 'Topic',
        topic_slug: 'topic',
        topic_markdown: 'Description',
        aliases: ['alias'],
        hostname_id: null,
        hostname: null,
        hostnames: [],
        approval_error_message: null,
        status: 'pending',
        reviewed_at: null,
        reviewed_by_id: null,
        rejection_reason: null,
        created_topic_id: null,
        topic_type: 'topic',
        example_referral_link: null,
        landing_page_urls: [],
      },
    },
  }
}

export function makeTopHashtagsResponse(
  overrides: Partial<TopHashtagsResponseBody> = {},
): TopHashtagsResponseBody {
  return {
    results: [],
    topics: {},
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    ...overrides,
  }
}
