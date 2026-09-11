'use client'

import { clientApi } from './instance'
import { admissionIdempotency } from './admission-idempotency'
import type {
  PostMutationResponseBody,
  PostResponseBody,
  PostsResponseBody,
} from '@/types/api-responses'

export type TopHashtagMapping = 'all' | 'linked' | 'unlinked'

export interface TopHashtag {
  topic_alias_id: string
  hashtag: string
  item_count: number
  contributor_count: number
  latest_content_id: string
  topic_id: string | null
}

export interface TopHashtagsResponseBody {
  results: TopHashtag[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
  topics: Record<string, { id: string; name: string; slug: string; topic_type: string }>
}

export interface TopicRecommendationMutationInput {
  title?: string
  markdown: string
  topic_title: string
  topic_slug: string
  topic_markdown?: string
  topic_hostname?: string
  topic_hostnames?: string[]
  topic_aliases?: string[]
  topic_type?: 'topic' | 'referral_program' | 'card'
  example_referral_link?: string
  landing_page_urls?: string[]
  cf_turnstile_response?: string
}

type TopicRecommendationUpdateInput = Partial<TopicRecommendationMutationInput>

export async function fetchTopicRecommendations(
  options: {
    q?: string
    status?: 'pending' | 'approved' | 'rejected'
    limit?: number
    signal?: AbortSignal
  } = {},
): Promise<PostsResponseBody> {
  return clientApi.get('/api/v1/topic-recommendations', {
    searchParams: {
      q: options.q,
      status: options.status,
      limit: options.limit,
    },
    signal: options.signal,
  })
}

export async function fetchTopHashtags(
  options: {
    q?: string
    mapping?: TopHashtagMapping
    after?: string
    limit?: number
    signal?: AbortSignal
  } = {},
): Promise<TopHashtagsResponseBody> {
  return clientApi.get('/api/v1/topic-recommendations/top-hashtags', {
    searchParams: {
      q: options.q,
      mapping: options.mapping,
      after: options.after,
      limit: options.limit,
    },
    signal: options.signal,
  })
}

export async function createTopicRecommendation(
  data: TopicRecommendationMutationInput,
): Promise<PostMutationResponseBody> {
  const intent = { endpoint: '/api/v1/topic-recommendations', body: data }
  return admissionIdempotency.run(intent, idempotencyKey =>
    clientApi.post<PostMutationResponseBody>('/api/v1/topic-recommendations', data, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  )
}

export async function updateTopicRecommendation(
  id: string,
  data: TopicRecommendationUpdateInput,
): Promise<PostMutationResponseBody> {
  return clientApi.patch(`/api/v1/topic-recommendations/${id}`, data)
}

export async function withdrawTopicRecommendation(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/topic-recommendations/${id}`)
}

export async function approveTopicRecommendation(id: string): Promise<{
  post: PostResponseBody['post']
  topic_id: string
  topic_slug: string
  topic_type: 'topic' | 'referral_program' | 'card'
}> {
  return clientApi.post(`/api/v1/topic-recommendations/${id}/approvals`, {})
}

export async function rejectTopicRecommendation(
  id: string,
  reason?: string,
): Promise<PostMutationResponseBody> {
  return clientApi.post(`/api/v1/topic-recommendations/${id}/rejections`, { reason })
}

export interface TopicRecommendationDuplicatesResult {
  exact_topic: { id: string; name: string; slug: string; topic_type: string } | null
  pending_recommendations: { post_id: string; topic_title: string; topic_slug: string }[]
  similar_topics: { id: string; name: string; slug: string; topic_type: string }[]
}

export async function fetchTopicRecommendationDuplicates(options: {
  topic_title: string
  topic_slug: string
  topic_aliases?: string[]
  topic_markdown?: string
  signal?: AbortSignal
}): Promise<TopicRecommendationDuplicatesResult> {
  const { signal, topic_aliases, ...rest } = options
  return clientApi.get('/api/v1/topic-recommendations/duplicates', {
    searchParams: {
      ...rest,
      ...(topic_aliases?.length ? { topic_aliases: topic_aliases.join(',') } : {}),
    },
    signal,
  })
}
