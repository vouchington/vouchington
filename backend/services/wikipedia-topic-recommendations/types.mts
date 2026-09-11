import type { Post, TopicRecommendationStatus } from '@services/posts/types'

export type { TopicRecommendationStatus }
// Canonical definition now lives in @voucha/types (see wikipedia-topic-recommendation.mts);
// re-exported here for call-site stability.
export type { SourceEntityType } from '@voucha/types/entities/wikipedia-topic-recommendation'

export type TopicRecommendationPost = Post & {
  post_type: 'topic_recommendation'
  topic_recommendation: NonNullable<Post['topic_recommendation']>
}

export type CreateTopicRecommendationInput = {
  title?: string
  markdown: string
  topic_title: string
  topic_slug: string
  topic_markdown?: string
  topic_hostname?: string
  topic_hostnames?: string[]
  topic_aliases?: string[]
  topic_wikipedia_pageid?: string
  topic_type?: 'topic' | 'referral_program' | 'card'
  example_referral_link?: string
  landing_page_urls?: string[]
}

export type UpdateTopicRecommendationInput = Partial<CreateTopicRecommendationInput>

export type TopicRecommendationSearchOptions = {
  status?: TopicRecommendationStatus
  q?: string
  limit?: number
  after?: string
}

export type TopicRecommendationFieldsInput = {
  topic_markdown?: string
  topic_hostname?: string
  topic_hostnames?: string[]
  topic_aliases?: string[]
  topic_wikipedia_pageid?: string
  topic_type?: 'topic' | 'referral_program' | 'card'
  example_referral_link?: string
  landing_page_urls?: string[]
}
