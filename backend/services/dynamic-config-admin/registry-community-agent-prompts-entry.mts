import {
  communityAgentPromptsConfig,
  COMMUNITY_AGENT_PROMPT_MAX_VALUES,
} from '@services/community-agent-prompts/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const communityAgentPromptsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'community-agent-prompts-config',
  label: 'Community Agent Prompts',
  description: 'Limits for community agent prompts and one moderation traversal page.',
  config: communityAgentPromptsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    prompts_per_user_per_community: {
      description: 'Maximum non-deleted prompts per creator per community, including drafts.',
      minValue: 1,
      maxValue: COMMUNITY_AGENT_PROMPT_MAX_VALUES.prompts_per_user_per_community,
      integer: true,
    },
    moderation_page_size: {
      description: 'Maximum active prompt candidates scanned by one moderation run.',
      minValue: 1,
      maxValue: COMMUNITY_AGENT_PROMPT_MAX_VALUES.moderation_page_size,
      integer: true,
    },
  },
})
