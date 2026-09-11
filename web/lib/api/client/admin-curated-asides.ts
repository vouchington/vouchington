'use client'

import { clientApi } from './instance'
import type {
  CuratedAsideItemResponse,
  CuratedAsideItemsResponse,
} from '@/types/api-responses/curated-aside-items'

export function adminListCuratedAsides(type: string): Promise<CuratedAsideItemsResponse> {
  return clientApi.get<CuratedAsideItemsResponse>(
    `/api/v1/curated-aside-items?type=${encodeURIComponent(type)}`,
  )
}

export function adminCreateCuratedAside(data: {
  aside_type: string
  entity_id: string
  position?: number
}): Promise<CuratedAsideItemResponse> {
  return clientApi.post<CuratedAsideItemResponse>('/api/v1/curated-aside-items', data)
}

export function adminDeleteCuratedAside(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/curated-aside-items/${id}`)
}

export function adminReorderCuratedAsides(aside_type: string, item_ids: string[]): Promise<void> {
  return clientApi.put('/api/v1/curated-aside-items/order', { aside_type, item_ids })
}
