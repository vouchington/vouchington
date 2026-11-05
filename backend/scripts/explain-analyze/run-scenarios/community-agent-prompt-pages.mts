import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { searchCommunityAgentPrompts } from '@services/community-agent-prompts/get'
import { assertCommunityAgentPromptCapacity } from '@services/community-agent-prompts/limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  COMMUNITY_AGENT_PROMPT_DEEP_BOUNDARY_ID,
  COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID,
  COMMUNITY_AGENT_PROMPT_PAGE_CREATOR_ID,
  COMMUNITY_AGENT_PROMPT_TOTAL_ROWS,
} from '../community-agent-prompt-page-ids.mts'

export async function runCommunityAgentPromptPageScenarios(): Promise<void> {
  registerScenarioContract('community-agent-prompt-capacity', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_community_agent_prompts__community_creator_id'] },
      { kind: 'maxProcessedRows', relation: 'community_agent_prompts', max: 30 },
    ],
    seededRows: { community_agent_prompts: COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + 4 },
  })
  await runAndCapture(
    'community-agent-prompt-capacity',
    async () => {
      await using query = await beginTransaction()
      await assert.rejects(
        assertCommunityAgentPromptCapacity(
          COMMUNITY_AGENT_PROMPT_PAGE_CREATOR_ID,
          COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID,
          query,
        ),
        { status: 409, code: 'COMMUNITY_AGENT_PROMPT_LIMIT_REACHED' },
      )
      await query.rollback()
    },
    undefined,
    'assertCommunityAgentPromptCapacity',
  )

  await runListPage('community-agent-prompts-first-page')
  await runListPage(
    'community-agent-prompts-deep-page',
    encodeScopedUuidCursor(
      COMMUNITY_AGENT_PROMPT_DEEP_BOUNDARY_ID,
      `community:${COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID}:agent-prompts`,
    ),
  )
}

async function runListPage(id: string, after?: string): Promise<void> {
  registerScenarioContract(id, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_community_agent_prompts__community_id', 'agent_prompts_pkey'],
      },
      { kind: 'maxProcessedRows', relation: 'community_agent_prompts', max: 32 },
      { kind: 'maxProcessedRows', relation: 'agent_prompts', max: 32 },
    ],
    seededRows: {
      community_agent_prompts: COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + 4,
      agent_prompts: COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + 4,
    },
  })
  await runAndCapture(
    id,
    async () => {
      const page = await searchCommunityAgentPrompts(COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID, {
        limit: 25,
        ...(after ? { after } : {}),
      })
      assert.equal(page.results.length, 25)
      assert.equal(page.page_info.has_next_page, true)
      if (after)
        assert.ok(page.results.every(prompt => prompt.id < COMMUNITY_AGENT_PROMPT_DEEP_BOUNDARY_ID))
    },
    undefined,
    'searchCommunityAgentPrompts',
  )
}
