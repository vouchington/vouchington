import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestAgent,
  insertTestAgentPrompt,
  insertTestPost,
  insertTestAgentModeration,
} from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { readAdminWorkflowTraining } from '@voucha/test-helpers/admin-workflow-fixtures'
import { getAgentModerationElectionVote } from '@services/elections-votes/agent-moderation'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import type { PrivateUser } from '@services/users/types'

const invoke = (user: PrivateUser, name: string, args: unknown) =>
  callMcpTool(
    name,
    args,
    { ...user, membership_plan: null },
    ['moderation:read', 'moderation:agent-votes'],
    ADMIN_MCP_SERVER_CONFIG,
  )

describe('registered agent moderation vote writes', () => {
  it('sets and clears an owned vote with history and no agent training evidence', async () => {
    const admin = await createTestUser({ administrator: true })
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    const suffix = randomUUID()
    const postId = await insertTestPost({
      createdById: admin.id,
      title: suffix,
      slug: `agent-vote-${suffix}`,
      markdown: 'Vote fixture',
    })
    const id = await insertTestAgentModeration({ postId, promptId, agentId: agent.id })
    expect(
      (await invoke(admin, 'set_agent_moderation_vote', { id, choice: 'accurate' })).isError,
    ).not.toBe(true)
    expect(await getAgentModerationElectionVote(admin.id, id)).toMatchObject({ choice: 'accurate' })
    expect(await readStaffActionHistory(admin.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_type: 'agent_moderation_vote_set',
          agent_moderation_id: id,
        }),
      ]),
    )
    expect((await invoke(admin, 'clear_agent_moderation_vote', { id })).isError).not.toBe(true)
    expect(await getAgentModerationElectionVote(admin.id, id)).toBeNull()
    expect(await readStaffActionHistory(admin.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_type: 'agent_moderation_vote_delete',
          agent_moderation_id: id,
        }),
      ]),
    )
    expect(await readAdminWorkflowTraining(admin.id)).toEqual([])
  })

  it.each(['set_agent_moderation_vote', 'clear_agent_moderation_vote'])(
    '%s refuses an unknown moderation with no vote history or training',
    async name => {
      const admin = await createTestUser({ administrator: true })
      const id = randomUUID()
      const result = await invoke(
        admin,
        name,
        name === 'set_agent_moderation_vote' ? { id, choice: 'accurate' } : { id },
      )
      expect(result.isError).toBe(true)
      const block = result.content[0]!
      if (block.type !== 'text') throw new Error('Expected typed error')
      expect(JSON.parse(block.text)).toMatchObject({ error: { status: 404, retryable: false } })
      expect(await getAgentModerationElectionVote(admin.id, id)).toBeNull()
      expect(await readStaffActionHistory(admin.id)).toEqual([])
      expect(await readAdminWorkflowTraining(admin.id)).toEqual([])
    },
  )
})
