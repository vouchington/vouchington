import { cache } from 'react'
import { serverApi } from './instance'
import type { RecommendedTopicsResponseBody } from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getRecommendedTopics = cache(function getRecommendedTopics(
  options: GetOptions = {},
): Promise<RecommendedTopicsResponseBody> {
  return serverApi.get('/api/v1/recommended-topics', options)
})
