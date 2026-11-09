import { seedUuid } from './seed-data/common.mts'

export const COMMUNITY_AGENT_PROMPT_SCENARIO_IDS = [
  'community-agent-prompt-capacity',
  'community-agent-prompts-first-page',
  'community-agent-prompts-deep-page',
  'active-community-prompts-first-candidate-page',
  'active-community-prompts-continuation-page',
  'active-community-prompts-ineligible-final-page',
  'community-agent-prompt-slot-count',
  'community-agent-prompt-slot-allocation',
  'community-agent-prompt-slot-retained-root-cleanup',
] as const

export const COMMUNITY_AGENT_PROMPT_CREATOR_COUNT = 100
export const COMMUNITY_AGENT_PROMPTS_PER_CREATOR = 25
export const COMMUNITY_AGENT_PROMPT_PAGE_ROWS =
  COMMUNITY_AGENT_PROMPT_CREATOR_COUNT * COMMUNITY_AGENT_PROMPTS_PER_CREATOR
export const COMMUNITY_AGENT_PROMPT_NOISE_COMMUNITIES = 99
export const COMMUNITY_AGENT_PROMPT_TOTAL_ROWS =
  COMMUNITY_AGENT_PROMPT_PAGE_ROWS +
  COMMUNITY_AGENT_PROMPT_NOISE_COMMUNITIES * COMMUNITY_AGENT_PROMPTS_PER_CREATOR
export const COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID = seedUuid(0, 'eb')
export const COMMUNITY_AGENT_PROMPT_PAGE_CREATOR_ID = seedUuid(0, 'ec')
export const COMMUNITY_AGENT_PROMPT_ALLOCATION_TARGET_ID = seedUuid(1, 'ef')
export const COMMUNITY_AGENT_PROMPT_DEEP_BOUNDARY_ID = seedUuid(499, 'ef')
