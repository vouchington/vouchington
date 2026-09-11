'use client'

import { clientApi } from './instance'
import type { CommunityAgentPrompt, CommunityAgentPromptsResponseBody } from '@/types/api-responses'

export type { CommunityAgentPrompt, CommunityAgentPromptsResponseBody } from '@/types/api-responses'

export interface CommunityAgentPromptHistoryEntry {
  id: string
  agent_prompt_id: string
  community_id: string
  action: 'created' | 'updated' | 'deleted' | 'allocated' | 'deallocated' | 'deactivated'
  changed_by: { id: string; username: string | null } | null
  previous_fields: Record<string, unknown>
  next_fields: Record<string, unknown>
  changed_fields: Record<string, { previous: unknown; next: unknown }>
  created_at: string
}

export interface CommunityAutomodSimulationResult {
  post_id: string
  title: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
  post_type: string
  approved_at: string
  content_excerpt: string
  flagged: boolean
  reason: string
  would_unpublish: boolean
}

export interface CommunityAutomodSimulation {
  simulation: {
    prompt_id: string
    time_window_hours: number
    sample_count: number
    would_flag_count: number
    would_unpublish_count: number
    false_positive_estimate: {
      historical_flagged_count: number
      historical_approved_count: number
      rate: number | null
    } | null
  }
  results: CommunityAutomodSimulationResult[]
}

export function fetchCommunityAgentPrompts(
  slug: string,
): Promise<CommunityAgentPromptsResponseBody> {
  return clientApi.get<CommunityAgentPromptsResponseBody>(
    `/api/v1/communities/${encodeURIComponent(slug)}/agent-prompts`,
  )
}

export function fetchCommunityAgentPrompt(
  slug: string,
  promptId: string,
): Promise<{ community_agent_prompt: CommunityAgentPrompt }> {
  return clientApi.get(
    `/api/v1/communities/${encodeURIComponent(slug)}/agent-prompts/${encodeURIComponent(promptId)}`,
  )
}

export function createCommunityAgentPrompt(
  slug: string,
  body: { prompt: string; model_name?: string; model_provider?: string },
): Promise<{ community_agent_prompt: CommunityAgentPrompt }> {
  return clientApi.post(`/api/v1/communities/${encodeURIComponent(slug)}/agent-prompts`, body)
}

export function updateCommunityAgentPrompt(
  slug: string,
  promptId: string,
  body: { prompt?: string },
): Promise<{ community_agent_prompt: CommunityAgentPrompt }> {
  return clientApi.patch(
    `/api/v1/communities/${encodeURIComponent(slug)}/agent-prompts/${encodeURIComponent(promptId)}`,
    body,
  )
}

export function deleteCommunityAgentPrompt(slug: string, promptId: string): Promise<void> {
  return clientApi.delete(
    `/api/v1/communities/${encodeURIComponent(slug)}/agent-prompts/${encodeURIComponent(promptId)}`,
  )
}

export function allocateCommunityAgentPromptSlot(slug: string, promptId: string): Promise<void> {
  return clientApi.post(
    `/api/v1/communities/${encodeURIComponent(slug)}/agent-prompts/${encodeURIComponent(promptId)}/allocations`,
  )
}

export function deallocateCommunityAgentPromptSlot(slug: string, promptId: string): Promise<void> {
  return clientApi.delete(
    `/api/v1/communities/${encodeURIComponent(slug)}/agent-prompts/${encodeURIComponent(promptId)}/allocations`,
  )
}

export function fetchCommunityAgentPromptHistory(
  slug: string,
  options?: { promptId?: string; before?: string },
): Promise<{ entries: CommunityAgentPromptHistoryEntry[]; next_cursor: string | null }> {
  return clientApi.get(`/api/v1/communities/${encodeURIComponent(slug)}/agent-prompts/history`, {
    searchParams: {
      ...(options?.promptId ? { promptId: options.promptId } : {}),
      ...(options?.before ? { before: options.before } : {}),
    },
  })
}

export function simulateCommunityAutomod(
  slug: string,
  body: { prompt_id: string; prompt?: string; time_window_hours?: number; limit?: number },
): Promise<CommunityAutomodSimulation> {
  return clientApi.post(`/api/v1/communities/${encodeURIComponent(slug)}/automod/simulate`, body)
}
