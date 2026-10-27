'use client'

import { clientApi } from './instance'
import type { TopicMergeResponseBody } from '@/types/api-responses'

export async function mergeTopicAliases(
  sourceTopicId: string,
  destinationIdOrSlug: string,
): Promise<TopicMergeResponseBody> {
  return clientApi.post<TopicMergeResponseBody>(`/api/v1/topics/${sourceTopicId}/merges`, {
    destination_id_or_slug: destinationIdOrSlug,
  })
}

export async function fetchTopicMergeOperation(
  sourceTopicId: string,
  operationId: string,
): Promise<TopicMergeResponseBody> {
  return clientApi.get<TopicMergeResponseBody>(
    `/api/v1/topics/${sourceTopicId}/merges/${operationId}`,
  )
}
