import type { PostsResponseBody } from '@/types/api-responses'
import type { PublicUser } from '@/types/user'
import { posts } from './entity-fixtures'

export const recommendationPost = {
  ...posts[0]!,
  id: 'topic-recommendation-story',
  title: 'Recommend a rewards-program topic',
  markdown: 'This request proposes a missing topic for Storybook coverage.',
  topic_recommendation: {
    post_id: 'topic-recommendation-story',
    topic_title: 'Storybook Rewards Program',
    topic_slug: 'storybook-rewards-program',
    topic_markdown: 'A fixture recommendation for topic review.',
    aliases: ['story rewards'],
    hostname_id: null,
    hostname: null,
    hostnames: [],
    approval_error_message: null,
    status: 'pending',
    reviewed_at: null,
    reviewed_by_id: null,
    rejection_reason: null,
    created_topic_id: null,
    created_topic_slug: null,
    topic_type: 'topic',
    example_referral_link: null,
    landing_page_urls: [],
  },
} satisfies (typeof posts)[number]

export const recommendationsResponse = {
  results: [
    {
      __entity_type: 'post',
      id: recommendationPost.id,
      ranking: 1,
      search_vector_ts: null,
    },
  ],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: { [recommendationPost.id]: recommendationPost },
  posts_metrics: {},
  post_elections: {
    [recommendationPost.id]: {
      __entity_type: 'post_election',
      id: 'post-election-topic-recommendation-story',
      votes_score_net: 4,
      votes_count_up: 5,
      votes_count_down: 1,
    },
  },
  election_votes: {},
  markdown_to_html: { [recommendationPost.id]: '<p>Storybook recommendation rationale.</p>' },
} satisfies PostsResponseBody

// A post with an approved recommendation
export const approvedRecommendationPost = {
  ...recommendationPost,
  id: 'topic-recommendation-approved',
  title: 'Recommend a previously approved topic',
  markdown: 'This recommendation was approved and a topic was created.',
  topic_recommendation: {
    ...recommendationPost.topic_recommendation,
    post_id: 'topic-recommendation-approved',
    topic_title: 'Approved Topic',
    topic_slug: 'approved-topic',
    status: 'approved',
    reviewed_at: '2026-05-01T10:00:00.000Z',
    reviewed_by_id: 'user-alex',
    created_topic_id: 'topic-approved-story',
    created_topic_slug: 'approved-topic-story',
    rejection_reason: null,
  },
} satisfies (typeof posts)[number]

// A post with a rejected recommendation
export const rejectedRecommendationPost = {
  ...recommendationPost,
  id: 'topic-recommendation-rejected',
  title: 'Recommend a rejected topic',
  markdown: 'This recommendation was reviewed and rejected.',
  topic_recommendation: {
    ...recommendationPost.topic_recommendation,
    post_id: 'topic-recommendation-rejected',
    topic_title: 'Rejected Topic',
    topic_slug: 'rejected-topic',
    status: 'rejected',
    reviewed_at: '2026-05-02T10:00:00.000Z',
    reviewed_by_id: 'user-alex',
    created_topic_id: null,
    rejection_reason: 'This topic is already covered by an existing entry.',
  },
} satisfies (typeof posts)[number]

export const storyReviewerUsers: Record<string, PublicUser> = {
  'user-alex': {
    id: 'user-alex',
    username: 'alex',
    profile_image_id: null,
  },
}

export const recommendationsMultiStatusResponse = {
  results: [
    { __entity_type: 'post', id: recommendationPost.id, ranking: 1, search_vector_ts: null },
    {
      __entity_type: 'post',
      id: approvedRecommendationPost.id,
      ranking: 2,
      search_vector_ts: null,
    },
    {
      __entity_type: 'post',
      id: rejectedRecommendationPost.id,
      ranking: 3,
      search_vector_ts: null,
    },
  ],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: {
    [recommendationPost.id]: recommendationPost,
    [approvedRecommendationPost.id]: approvedRecommendationPost,
    [rejectedRecommendationPost.id]: rejectedRecommendationPost,
  },
  posts_metrics: {},
  post_elections: {
    [recommendationPost.id]: {
      __entity_type: 'post_election',
      id: 'post-election-topic-recommendation-story',
      votes_score_net: 4,
      votes_count_up: 5,
      votes_count_down: 1,
    },
  },
  election_votes: {},
  markdown_to_html: {
    [recommendationPost.id]: '<p>Storybook recommendation rationale.</p>',
    [approvedRecommendationPost.id]: '<p>This recommendation was approved.</p>',
    [rejectedRecommendationPost.id]: '<p>This recommendation was rejected.</p>',
  },
  users: storyReviewerUsers,
} satisfies PostsResponseBody
