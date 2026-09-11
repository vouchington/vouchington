import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { PostResponseBody, PostsResponseBody } from '@/types/api-responses'
import type { TopHashtagsResponseBody } from '../client/topic-recommendations'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getTopicRecommendations = cache(function getTopicRecommendations(
  options: GetOptions = {},
): Promise<PostsResponseBody> {
  return serverApi.get('/api/v1/topic-recommendations', options)
})

export const getTopHashtags = cache(function getTopHashtags(
  options: GetOptions = {},
): Promise<TopHashtagsResponseBody> {
  return serverApi.get('/api/v1/topic-recommendations/top-hashtags', options)
})

export const getTopicRecommendation = cache(function getTopicRecommendation(
  id: string,
  options?: { headers?: Record<string, string> },
): Promise<PostResponseBody | null> {
  return returnNullForMissingEntity(serverApi.get(`/api/v1/topic-recommendations/${id}`, options))
})
