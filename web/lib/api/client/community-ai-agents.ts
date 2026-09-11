'use client'
import { clientApi } from './instance'
import type { CommunityAiAgentResponseBody } from '@/types/api-responses'

export function enableCommunityAiAgent(
  idOrSlug: string,
  agentSlug: string,
): Promise<CommunityAiAgentResponseBody> {
  return clientApi.put<CommunityAiAgentResponseBody>(
    `/api/v1/communities/${idOrSlug}/ai-agents/${agentSlug}`,
  )
}

export function disableCommunityAiAgent(
  idOrSlug: string,
  agentSlug: string,
): Promise<CommunityAiAgentResponseBody> {
  return clientApi.delete<CommunityAiAgentResponseBody>(
    `/api/v1/communities/${idOrSlug}/ai-agents/${agentSlug}`,
  )
}
