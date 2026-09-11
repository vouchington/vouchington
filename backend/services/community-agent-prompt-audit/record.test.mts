import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  getCommunityAgentPromptChangeRowsForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { recordCommunityAgentPromptChange } from './record.mts'
import { randomBytes } from 'node:crypto'

describe('recordCommunityAgentPromptChange', () => {
  let user: PrivateUser
  let community: Community

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
    community = await insertTestCommunity({ createdById: user.id })
  })

  it('inserts a row into community_agent_prompt_changes', async () => {
    const agentPromptId = `00000000-0000-7000-8000-${randomBytes(6).toString('hex')}`
    const prev = { prompt: 'before', slot_allocated: false }
    const next = { prompt: 'after', slot_allocated: true }

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
    expect(row!.agent_prompt_id).toBe(agentPromptId)
    expect(row!.community_id).toBe(community.id)
    expect(row!.changed_by_id).toBe(user.id)
    expect(row!.action).toBe('updated')
    expect(row!.previous_fields).toMatchObject(prev)
    expect(row!.next_fields).toMatchObject(next)
  })

  it('records multiple changes for the same prompt', async () => {
    const agentPromptId = `00000000-0000-7000-8000-${randomBytes(6).toString('hex')}`

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
    expect(rows[0]!.action).toBe('updated')
    expect(rows[1]!.action).toBe('created')
  })

  it('resolves without error for valid audit record', async () => {
    const agentPromptId = `00000000-0000-7000-8000-${randomBytes(6).toString('hex')}`

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
