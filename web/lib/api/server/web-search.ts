import { cache } from 'react'
import { serverApi } from './instance'
import type { WebSearchResponseBody } from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getWebSearch = cache(
  async (options: GetOptions = {}): Promise<WebSearchResponseBody> => {
    return serverApi.get<WebSearchResponseBody>('/api/v1/web-search', options)
  },
)
