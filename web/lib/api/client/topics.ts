'use client'

/**
 * Topics API methods
 */

import { clientApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import { toTopicAliasRecords, type TopicAliasesWireResponse } from '../topic-alias-records'
import type {
  TopicsSearchResponseBody,
  TopicResponseBody,
  TopicMutationResponseBody,
  TopicMergeResponseBody,
  ListResponse,
} from '@/types/api-responses'
import type { Topic, TopicTypes } from '@/types/topics'

export type { TopicsSearchResponseBody } from '@/types/api-responses'

interface FetchTopicsOptions {
  q?: string // Search query
  topic_types?: TopicTypes[] // Filter by topic types
  sort?: 'new' | 'best' | 'relevance' // Sort order
  limit?: number // Results per page (default: 25)
  after?: string // Cursor for pagination
  spending_category?: boolean // Filter by spending category topics
  /** Embedding-ranked semantic search query (do not combine with q for topics). */
  semantic_search_query?: string
  signal?: AbortSignal // Request cancellation signal
}

export async function fetchTopics(
  options: FetchTopicsOptions = {},
): Promise<TopicsSearchResponseBody> {
  return clientApi.get<TopicsSearchResponseBody>('/api/v1/topics', {
    searchParams: {
      q: options.q,
      topic_types: options.topic_types?.join(','),
      sort: options.sort,
      limit: options.limit,
      after: options.after,
      spending_category: options.spending_category,
      semantic_search_query: options.semantic_search_query,
    },
    signal: options.signal,
  })
}

export async function fetchTopic(topicId: string): Promise<Topic | null> {
  const data = await returnNullForMissingEntity(
    clientApi.get<TopicResponseBody>(`/api/v1/topics/${topicId}`),
  )
  return data?.topic ?? null
}

export async function createTopic(data: {
  name: string
  slug: string
  topic_type?: TopicTypes
  markdown?: string
  /** Hostname string (e.g. "thepointsguy.com") — resolved server-side */
  hostname?: string | null
  /** Claim an unlinked hashtag alias in the topic creation transaction. */
  source_topic_alias_id?: string
}): Promise<TopicMutationResponseBody> {
  return clientApi.post<TopicMutationResponseBody>('/api/v1/topics', data)
}

export async function updateTopic(
  id: string,
  data: {
    name?: string
    slug?: string
    markdown?: string
    topic_type?: string
    noindex?: boolean
    allow_reviews?: boolean
    /** Hostname string (e.g. "thepointsguy.com") — resolved server-side */
    hostname?: string | null
    logo_image_id?: string | null
    hero_image_id?: string | null
  },
): Promise<TopicMutationResponseBody> {
  return clientApi.patch<TopicMutationResponseBody>(`/api/v1/topics/${id}`, data)
}

function typeSlugToKey(typeSlug: string): string {
  return `${typeSlug.replaceAll('-', '_')}_attributes`
}

export async function getTopicTypeAttributes<T>(topicId: string, typeSlug: string): Promise<T> {
  const response = await clientApi.get<Record<string, T>>(`/api/v1/topics/${topicId}/${typeSlug}`)
  return response[typeSlugToKey(typeSlug)]!
}

export async function updateTopicTypeAttributes<T>(
  topicId: string,
  typeSlug: string,
  data: Record<string, unknown>,
): Promise<T> {
  const response = await clientApi.patch<Record<string, T>>(
    `/api/v1/topics/${topicId}/${typeSlug}`,
    data,
  )
  return response[typeSlugToKey(typeSlug)]!
}

export async function fetchTopicAliases(
  topicId: string,
  options: { after?: string; limit?: number } = {},
): Promise<ListResponse<{ id: string; alias: string }>> {
  const response = await clientApi.get<TopicAliasesWireResponse>(
    `/api/v1/topics/${topicId}/aliases`,
    {
      searchParams: { after: options.after, limit: options.limit },
    },
  )
  return toTopicAliasRecords(response)
}

export async function createTopicAliases(
  topicId: string,
  aliases: string,
): Promise<{ added: unknown[] }> {
  return clientApi.post(`/api/v1/topics/${topicId}/aliases`, { aliases })
}

export async function deleteTopicAlias(topicId: string, aliasId: string): Promise<void> {
  return clientApi.delete(`/api/v1/topics/${topicId}/aliases/${aliasId}`)
}

export async function linkTopicAlias(topicId: string, aliasId: string): Promise<void> {
  return clientApi.post(`/api/v1/topics/${topicId}/aliases/${aliasId}`, {})
}

export async function unlinkTopicAlias(topicId: string, aliasId: string): Promise<void> {
  return clientApi.delete(`/api/v1/topics/${topicId}/aliases/${aliasId}`)
}

export async function mergeTopicAliases(
  sourceTopicId: string,
  destinationIdOrSlug: string,
): Promise<TopicMergeResponseBody> {
  return clientApi.post<TopicMergeResponseBody>(`/api/v1/topics/${sourceTopicId}/merges`, {
    destination_id_or_slug: destinationIdOrSlug,
  })
}

export async function fetchSpendingCategoryAttributes(
  topicId: string,
): Promise<Record<string, unknown>> {
  const { spending_category_attributes } = await clientApi.get<{
    spending_category_attributes: Record<string, unknown>
  }>(`/api/v1/topics/${topicId}/spending-category`)
  return spending_category_attributes
}

export async function updateSpendingCategoryAttributes(
  topicId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { spending_category_attributes } = await clientApi.patch<{
    spending_category_attributes: Record<string, unknown>
  }>(`/api/v1/topics/${topicId}/spending-category`, data)
  return spending_category_attributes
}

export async function fetchRssFeeds(
  topicIdentifier: string,
  options?: {
    include_descendants?: boolean
    enabled?: boolean | null
    discoverable?: boolean | null
  },
): Promise<ListResponse<unknown>> {
  const enabled =
    options?.enabled === null
      ? 'null'
      : options?.enabled === undefined
        ? undefined
        : options.enabled
  const discoverable =
    options?.discoverable === null
      ? 'null'
      : options?.discoverable === undefined
        ? undefined
        : options.discoverable
  return clientApi.get('/api/v1/rss-feeds', {
    searchParams: {
      topic: topicIdentifier,
      include_descendants: options?.include_descendants,
      enabled,
      discoverable,
    },
  })
}
