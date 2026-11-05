import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const COMMUNITY_AGENT_PROMPT_MAX_VALUES = { prompts_per_user_per_community: 100 }

export const communityAgentPromptsConfig = new DynamicConfig({
  key: 'community-agent-prompts-config',
  fieldTypes: { prompts_per_user_per_community: 'number' },
  defaultFields: { prompts_per_user_per_community: 25 },
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
