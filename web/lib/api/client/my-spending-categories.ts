'use client'

import { clientApi } from './instance'
import type { ListResponse, SpendingCategoryResponseBody } from '@/types/api-responses'
import type {
  CreateMySpendingCategoryBody,
  SpendingCategory,
  UpdateMySpendingCategoryBody,
} from '@/types/my'
import { isMoney } from '@ts-shared/money'

export function createMySpendingCategory(
  body: CreateMySpendingCategoryBody,
): Promise<SpendingCategoryResponseBody> {
  if (!isMoney(body.amount)) throw new TypeError('amount must be valid money')
  return clientApi.post<SpendingCategoryResponseBody>('/api/v1/my/spending-categories', body)
}

export function getMySpendingCategoriesClient(options?: {
  after?: string
  limit?: number
}): Promise<ListResponse<SpendingCategory>> {
  return clientApi.get<ListResponse<SpendingCategory>>('/api/v1/my/spending-categories', {
    searchParams: options,
  })
}

export function updateMySpendingCategory(
  id: string,
  body: UpdateMySpendingCategoryBody,
): Promise<SpendingCategoryResponseBody> {
  if (body.amount !== undefined && !isMoney(body.amount)) {
    throw new TypeError('amount must be valid money')
  }
  return clientApi.patch<SpendingCategoryResponseBody>(`/api/v1/my/spending-categories/${id}`, body)
}

export function deleteMySpendingCategory(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/spending-categories/${id}`)
}
