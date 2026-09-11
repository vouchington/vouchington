'use client'

import { clientApi } from './instance'
import type { ListResponse } from '@/types/api-responses'

export interface TopicAdditionalHostname {
  hostname_id: string
  hostname: string
  topic_id: string
  created_at: string
}

/**
 * List additional hostnames for a topic
 * GET /api/v1/topics/:id/additional-hostnames
 */
export async function fetchAdditionalHostnames(
  topicId: string,
  options: { after?: string; limit?: number } = {},
): Promise<ListResponse<TopicAdditionalHostname>> {
  return clientApi.get(`/api/v1/topics/${topicId}/additional-hostnames`, {
    searchParams: { after: options.after, limit: options.limit },
  })
}

/**
 * Add an additional hostname to a topic
 * POST /api/v1/topics/:id/additional-hostnames
 */
export async function addAdditionalHostname(
  topicId: string,
  hostname: string,
): Promise<{ additional_hostname: TopicAdditionalHostname }> {
  return clientApi.post(`/api/v1/topics/${topicId}/additional-hostnames`, { hostname })
}

/**
 * Remove an additional hostname from a topic
 * DELETE /api/v1/topics/:id/additional-hostnames/:hostnameId
 */
export async function removeAdditionalHostname(topicId: string, hostnameId: string): Promise<void> {
  return clientApi.delete(`/api/v1/topics/${topicId}/additional-hostnames/${hostnameId}`)
}
