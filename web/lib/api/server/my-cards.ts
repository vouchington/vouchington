import { cache } from 'react'
import { serverApi } from './instance'
import type { ListResponse } from '@/types/api-responses'
import type { IndividualCard } from '@/types/my-cards'

interface MyCardsPaginationOptions {
  after?: string
  limit?: number
  headers?: Record<string, string>
}

export const getMyCards = cache(
  async (options?: MyCardsPaginationOptions): Promise<ListResponse<IndividualCard>> => {
    const searchParams: Record<string, string> = {}
    if (options?.after) searchParams.after = options.after
    if (options?.limit !== undefined) searchParams.limit = options.limit.toString()
    return serverApi.get<ListResponse<IndividualCard>>('/api/v1/my/cards', {
      headers: options?.headers,
      ...(Object.keys(searchParams).length > 0 ? { searchParams } : {}),
    })
  },
)
