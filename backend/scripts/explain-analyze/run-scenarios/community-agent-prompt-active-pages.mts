import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getActiveCommunityAgentPromptPage } from '@services/community-agent-prompts/get-active-prompts'
import {
  COMMUNITY_AGENT_PROMPT_PAGE_ROWS,
  COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID,
} from '../community-agent-prompt-page-ids.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runActiveCandidatePages(promptSeededRows: number): Promise<void> {
  const communityId = COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID
  const expectations = [
    { kind: 'usesIndexes' as const, indexes: ['idx_community_agent_prompts__active'] },
    { kind: 'maxProcessedRows' as const, relation: 'community_agent_prompts', max: 90 },
    { kind: 'maxProcessedRows' as const, relation: 'agent_prompts', max: 65 },
    { kind: 'maxProcessedRows' as const, relation: 'memberships', max: 35 },
  ]
  const seededRows = {
    community_agent_prompts: promptSeededRows,
    agent_prompts: promptSeededRows,
  }
  registerScenarioContract('active-community-prompts-first-candidate-page', {
    expectations,
    seededRows,
  })
  let next: Awaited<ReturnType<typeof getActiveCommunityAgentPromptPage>>['next'] = null
  await runAndCapture(
    'active-community-prompts-first-candidate-page',
    async () => {
      const page = await getActiveCommunityAgentPromptPage(communityId, null, 30)
      assert.equal(page.items.length, 0)
      assert.ok(page.next)
      next = page.next
    },
    undefined,
    'getActiveCommunityAgentPromptPage',
  )
  registerScenarioContract('active-community-prompts-continuation-page', {
    expectations,
    seededRows,
  })
  await runAndCapture(
    'active-community-prompts-continuation-page',
    async () => {
      const page = await getActiveCommunityAgentPromptPage(communityId, next, 30)
      assert.equal(page.items.length, 0)
      assert.ok(page.next)
    },
    undefined,
    'getActiveCommunityAgentPromptPage',
  )
  const finalPageBoundaryId = seedUuid(COMMUNITY_AGENT_PROMPT_PAGE_ROWS - 11, 'ef')
  const { rows: boundary } = await read<{ activation_cursor: string }>(sql`
    /* activeCommunityPromptFinalPageBoundary */
    SELECT to_char(activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS activation_cursor
    FROM community_agent_prompts WHERE id = ${finalPageBoundaryId}
    LIMIT 1
  `)
  const activatedAt = boundary[0]?.activation_cursor
  if (!activatedAt) throw new Error('active prompt boundary was not seeded')
  registerScenarioContract('active-community-prompts-ineligible-final-page', {
    expectations,
    seededRows,
  })
  await runAndCapture(
    'active-community-prompts-ineligible-final-page',
    async () => {
      const page = await getActiveCommunityAgentPromptPage(
        communityId,
        { activatedAt, id: finalPageBoundaryId },
        30,
      )
      assert.equal(page.items.length, 0)
      assert.equal(page.next, null)
    },
    undefined,
    'getActiveCommunityAgentPromptPage',
  )
}
