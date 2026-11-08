import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { searchCommunityAgentPrompts } from '@services/community-agent-prompts/get'
import { assertCommunityAgentPromptCapacity } from '@services/community-agent-prompts/limits'
import { allocateCommunityAgentPromptSlotInTransaction } from '@services/community-agent-prompts/allocate'
import { getUsedSlotsForUser } from '@services/community-agent-prompts/slots'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS } from '../seed-data/community-agent-prompt-slot-counts.mts'
import {
  COMMUNITY_AGENT_PROMPT_DEEP_BOUNDARY_ID,
  COMMUNITY_AGENT_PROMPT_ALLOCATION_TARGET_ID,
  COMMUNITY_AGENT_PROMPT_CREATOR_COUNT,
  COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID,
  COMMUNITY_AGENT_PROMPT_PAGE_CREATOR_ID,
  COMMUNITY_AGENT_PROMPT_TOTAL_ROWS,
} from '../community-agent-prompt-page-ids.mts'
import { runSlotRetainedRootCleanupScenario } from './community-agent-prompt-slot-retained-root.mts'

export async function runCommunityAgentPromptPageScenarios(): Promise<void> {
  const promptSeededRows =
    COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS + 4
  registerScenarioContract('community-agent-prompt-capacity', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_community_agent_prompts__community_creator_id'] },
      { kind: 'maxProcessedRows', relation: 'community_agent_prompts', max: 30 },
    ],
    seededRows: { community_agent_prompts: promptSeededRows },
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
  await runSlotScenarios()
  await runSlotRetainedRootCleanupScenario()
}

async function runSlotScenarios(): Promise<void> {
  const creatorId = COMMUNITY_AGENT_PROMPT_PAGE_CREATOR_ID
  const seededRows = {
    community_agent_prompts:
      COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS + 4,
    agent_prompts:
      COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS + 4,
    community_agent_prompt_slot_counts:
      COMMUNITY_AGENT_PROMPT_CREATOR_COUNT + COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS + 2,
  }
  registerScenarioContract('community-agent-prompt-slot-count', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['community_agent_prompt_slot_counts_pkey'] },
      { kind: 'maxProcessedRows', relation: 'community_agent_prompt_slot_counts', max: 1 },
    ],
    seededRows,
  })
  await runAndCapture(
    'community-agent-prompt-slot-count',
    async () => assert.equal(await getUsedSlotsForUser(creatorId), 1),
    undefined,
    'getUsedSlotsForUser',
  )

  registerScenarioContract('community-agent-prompt-slot-allocation', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['community_agent_prompts_pkey', 'uq_community_agent_prompts__id__community'],
        anyOf: true,
        queryContains: '/* allocateCommunityAgentPromptSlot */',
      },
      {
        kind: 'usesIndexes',
        indexes: ['community_agent_prompt_slot_counts_pkey'],
        queryContains: '/* allocateCommunityAgentPromptSlot:count */',
      },
      // EXPLAIN counts the one index visit and the one ModifyTable returned row separately.
      { kind: 'maxProcessedRows', relation: 'community_agent_prompts', max: 2 },
      { kind: 'maxProcessedRows', relation: 'community_agent_prompt_slot_counts', max: 1 },
    ],
    seededRows,
  })
  await runAndCapture(
    'community-agent-prompt-slot-allocation',
    async () => {
      await using query = await beginTransaction()
      const state = await allocateCommunityAgentPromptSlotInTransaction(
        creatorId,
        COMMUNITY_AGENT_PROMPT_ALLOCATION_TARGET_ID,
        3,
        query,
      )
      assert.equal(state.is_slot_allocated, true)
      const { rows } = await query<{
        allocated_count: number
      }>(sql`/* verifyPromptSlotAllocationProjection */
        SELECT allocated_count FROM community_agent_prompt_slot_counts
        WHERE creator_user_id = ${creatorId}
      `)
      assert.equal(rows[0]?.allocated_count, 2)
      await query.rollback()
    },
    undefined,
    ['allocateCommunityAgentPromptSlot', 'allocateCommunityAgentPromptSlot:count'],
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
      community_agent_prompts:
        COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS + 4,
      agent_prompts:
        COMMUNITY_AGENT_PROMPT_TOTAL_ROWS + COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS + 4,
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
