'use client'

import { clientApi } from './instance'
import type { IndividualCardResponseBody } from '@/types/api-responses'
import type { CreateMyCardBody, UpdateMyCardBody } from '@/types/my-cards'

export function createMyCard(body: CreateMyCardBody): Promise<IndividualCardResponseBody> {
  return clientApi.post<IndividualCardResponseBody>('/api/v1/my/cards', body)
}

export function updateMyCard(
  id: string,
  body: UpdateMyCardBody,
): Promise<IndividualCardResponseBody> {
  return clientApi.patch<IndividualCardResponseBody>(`/api/v1/my/cards/${id}`, body)
}

export function deleteMyCard(id: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/cards/${id}`)
}
