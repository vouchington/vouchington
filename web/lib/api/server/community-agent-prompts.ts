import { cache } from 'react'
import { serverApi } from './instance'
import type {
  CommunityAgentPromptHistoryEntry,
  CommunityAgentPromptsResponseBody,
} from '../client/community-agent-prompts'

export const getCommunityAgentPrompts = cache(
  async (idOrSlug: string): Promise<CommunityAgentPromptsResponseBody> => {
    return serverApi.get<CommunityAgentPromptsResponseBody>(
      `/api/v1/communities/${encodeURIComponent(idOrSlug)}/agent-prompts`,
    )
  },
)

export const getCommunityAgentPromptHistory = cache(
  async (
    idOrSlug: string,
    options?: { promptId?: string; before?: string },
  ): Promise<{ entries: CommunityAgentPromptHistoryEntry[]; next_cursor: string | null }> => {
    const searchParams: Record<string, string> = {}
    if (options?.promptId) searchParams['promptId'] = options.promptId
    if (options?.before) searchParams['before'] = options.before
    return serverApi.get(
      `/api/v1/communities/${encodeURIComponent(idOrSlug)}/agent-prompts/history`,
      { searchParams },
    )
  },
)
