import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  getCommunityAgentPromptChangeRowsForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { recordCommunityAgentPromptChange } from './record.mts'

describe('recordCommunityAgentPromptChange', () => {
  let user: PrivateUser
  let community: Community

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
    community = await insertTestCommunity({ createdById: user.id })
  })

  it('inserts a row into community_agent_prompt_revisions', async () => {
    const { id: agentPromptId } = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user.id,
    })
    const prev = { prompt: 'before', is_slot_allocated: false }
    const next = { prompt: 'after', is_slot_allocated: true }

    await recordCommunityAgentPromptChange(
      user.id,
      community.id,
      agentPromptId,
      'updated',
      prev,
      next,
    )

    const rows = await getCommunityAgentPromptChangeRowsForTest(agentPromptId)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toBeDefined()
    expect(row!.community_agent_prompt_id).toBe(agentPromptId)
    expect(row!.community_id).toBe(community.id)
    expect(row!.revised_by_id).toBe(user.id)
    expect(row!.revision_type).toBe('updated')
    expect(row!.changes).toEqual({
      prompt: { before: prev.prompt, after: next.prompt },
      is_slot_allocated: { before: false, after: true },
    })
  })

  it('records multiple changes for the same prompt', async () => {
    const { id: agentPromptId } = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user.id,
    })

    await recordCommunityAgentPromptChange(
      user.id,
      community.id,
      agentPromptId,
      'created',
      {},
      {
        prompt: 'initial',
      },
    )
    await recordCommunityAgentPromptChange(
      user.id,
      community.id,
      agentPromptId,
      'updated',
      { prompt: 'initial' },
      { prompt: 'revised' },
    )

    const rows = await getCommunityAgentPromptChangeRowsForTest(agentPromptId)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.revision_type).toBe('updated')
    expect(rows[1]!.revision_type).toBe('created')
  })

  it('resolves without error for valid audit record', async () => {
    const { id: agentPromptId } = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user.id,
    })

    await expect(
      recordCommunityAgentPromptChange(
        user.id,
        community.id,
        agentPromptId,
        'deleted',
        {
          prompt: 'old',
        },
        {},
      ),
    ).resolves.toBeUndefined()
  })
})
