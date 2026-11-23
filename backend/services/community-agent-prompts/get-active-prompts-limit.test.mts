import { describe, expect, it } from 'vitest'
import { COMMUNITY_AGENT_PROMPT_MAX_VALUES } from './config.mts'
import { getActiveCommunityAgentPromptPage } from './get-active-prompts.mts'

describe('active community prompt page size', () => {
  const maximum = COMMUNITY_AGENT_PROMPT_MAX_VALUES.moderation_page_size

  it.each([0, 1.5, maximum + 1])('rejects an invalid page size of %s', async limit => {
    await expect(
      getActiveCommunityAgentPromptPage(crypto.randomUUID(), null, limit),
    ).rejects.toThrow(`active community prompt page limit must be between 1 and ${maximum}`)
  })
})
