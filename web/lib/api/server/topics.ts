import { cache } from 'react'
import { serverApi } from './instance'
import { toTopicAliasRecords, type TopicAliasesWireResponse } from '../topic-alias-records'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  TopicsResponseBody,
  TopicResponseBody,
  TopicFollowContextResponseBody,
  ListResponse,
} from '@/types/api-responses'
import type { TopicAdditionalHostname } from '@/lib/api/client/topic-additional-hostnames'

export interface PublisherTypeTopic {
  id: string
  slug: string
  label: string
}
export interface PublisherTypesResponse {
  publisher_types: PublisherTypeTopic[]
}
export interface UserTagsResponse {
  user_tags: UserTagTopic[]
}
export interface UserTagTopic {
  id: string
  slug: string
  label: string
}

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getTopics = cache(async (options: GetOptions = {}): Promise<TopicsResponseBody> => {
  return serverApi.get<TopicsResponseBody>('/api/v1/topics', options)
})

export const getTopic = cache(
  async (
    idOrSlug: string,
    options?: { headers?: Record<string, string> },
  ): Promise<TopicResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<TopicResponseBody>(`/api/v1/topics/${encodeURIComponent(idOrSlug)}`, options),
    )
  },
)

export const getTopicAliasesSearch = cache(
  async <T>(
    searchParams?: Record<string, string | number | boolean | undefined>,
    options?: { headers?: Record<string, string> },
  ): Promise<T> => {
    return serverApi.get<T>('/api/v1/topics/aliases', {
      headers: options?.headers,
      searchParams,
    })
  },
)

export const getTopicFollowContext = cache(async (idOrSlug: string) => {
  return serverApi.get<TopicFollowContextResponseBody>(
    `/api/v1/topics/${encodeURIComponent(idOrSlug)}/follow-context`,
  )
})

export const getTopicAliases = cache(
  async (topicId: string): Promise<ListResponse<{ id: string; alias: string }>> => {
    const response = await serverApi.get<TopicAliasesWireResponse>(
      `/api/v1/topics/${encodeURIComponent(topicId)}/aliases`,
    )
    return toTopicAliasRecords(response)
  },
)

export const getTopicAdditionalHostnames = cache(
  async (topicId: string): Promise<ListResponse<TopicAdditionalHostname>> => {
    return serverApi.get<ListResponse<TopicAdditionalHostname>>(
      `/api/v1/topics/${encodeURIComponent(topicId)}/additional-hostnames`,
    )
  },
)

export const getTopicSpendingCategoryAttributes = cache(
  async (topicId: string): Promise<{ spending_category_attributes: Record<string, unknown> }> => {
    return serverApi.get<{ spending_category_attributes: Record<string, unknown> }>(
      `/api/v1/topics/${encodeURIComponent(topicId)}/spending-category`,
    )
  },
)

export const getTopicTypeAttributesServer = cache(
  async <T>(topicId: string, typeSlug: string): Promise<T> => {
    const typeKey = `${typeSlug.replaceAll('-', '_')}_attributes`
    const response = await serverApi.get<Record<string, T>>(
      `/api/v1/topics/${encodeURIComponent(topicId)}/${typeSlug}`,
    )
    const value = response[typeKey]
    if (value === undefined)
      throw new Error(`Missing key "${typeKey}" in topic type attributes response`)
    return value
  },
)

export const getPublisherTypes = cache(async (): Promise<PublisherTypesResponse> => {
  return serverApi.get<PublisherTypesResponse>('/api/v1/topics/publisher-types')
})

export const getUserTags = cache(async (): Promise<UserTagsResponse> => {
  return serverApi.get<UserTagsResponse>('/api/v1/topics/user-tags')
})
