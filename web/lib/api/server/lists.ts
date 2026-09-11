import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  ListResponseBody,
  ListsSearchResponseBody,
  ListItemsResponseBody,
} from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getList = cache(
  async (
    listId: string,
    options?: { headers?: Record<string, string> },
  ): Promise<ListResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<ListResponseBody>(`/api/v1/lists/${listId}`, options),
      { nullStatusCodes: [404, 422] },
    )
  },
)

export const getListItems = cache(
  async (listId: string, options: GetOptions = {}): Promise<ListItemsResponseBody> => {
    return serverApi.get<ListItemsResponseBody>(`/api/v1/lists/${listId}/items`, options)
  },
)

export const getMyLists = cache(
  async (options: GetOptions = {}): Promise<ListsSearchResponseBody> => {
    return serverApi.get<ListsSearchResponseBody>('/api/v1/lists', options)
  },
)
