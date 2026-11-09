import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const COMMUNITY_AGENT_PROMPT_MAX_VALUES = {
  prompts_per_user_per_community: 100,
  moderation_page_size: 30,
}

export const communityAgentPromptsConfig = new DynamicConfig({
  key: 'community-agent-prompts-config',
  fieldTypes: { prompts_per_user_per_community: 'number', moderation_page_size: 'number' },
  defaultFields: { prompts_per_user_per_community: 25, moderation_page_size: 30 },
})

export function getCommunityAgentPromptLimit(): number {
  return getBoundedPositiveIntegerField(
    communityAgentPromptsConfig,
    'prompts_per_user_per_community',
    {
      defaultValue: 25,
      maxValue: COMMUNITY_AGENT_PROMPT_MAX_VALUES.prompts_per_user_per_community,
    },
  )
}

export function getCommunityModerationPageSize(): number {
  return getBoundedPositiveIntegerField(communityAgentPromptsConfig, 'moderation_page_size', {
    defaultValue: 30,
    maxValue: COMMUNITY_AGENT_PROMPT_MAX_VALUES.moderation_page_size,
  })
}
