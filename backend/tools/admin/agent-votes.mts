import assert from 'http-assert'
import { getAgentModerationElectionByIdCachedBatch } from '@services/entity-fetch/get'
import { getAgentModerationElectionVote } from '@services/elections-votes/agent-moderation'
import { upsertAgentModerationVotesWithTrainingEvidence } from '@services/elections-votes/agent-moderation/votes-with-training'
import {
  getElectionVoteChoiceScore,
  withElectionVoteRequestLock,
} from '@services/elections-votes/shared'
import { enqueueBulkUpdateAgentModerationElectionVoteStats } from '@queues/elections/enqueues'
import { createAdminTool, adminInput, UUID_INPUT } from './create-admin-tool.mts'

function agentVoteTool(name: string, clear: boolean) {
  return createAdminTool<{ id: string; choice?: 'accurate' | 'inaccurate' }>({
    name,
    description:
      'Change an audited agent moderation accuracy vote without creating training evidence.',
    scope: 'moderation:agent-votes',
    api: { method: clear ? 'DELETE' : 'PUT', path: '/api/v1/agent-moderations/:id/vote' },
    parameters: adminInput(
      {
        id: UUID_INPUT,
        ...(clear ? {} : { choice: { type: 'string', enum: ['accurate', 'inaccurate'] } }),
      },
      clear ? ['id'] : ['id', 'choice'],
    ),
    outputSchema: {
      type: 'object',
      properties: { success: { const: true } },
      required: ['success'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => {
      const [moderation] = await getAgentModerationElectionByIdCachedBatch([args.id])
      assert(moderation, 404, 'Agent moderation not found')
      await withElectionVoteRequestLock('agent_moderation', user.id, args.id, async () => {
        const current = await getAgentModerationElectionVote(user.id, args.id)
        if ((clear && !current) || (!clear && current?.choice === args.choice)) {
          await enqueueBulkUpdateAgentModerationElectionVoteStats([args.id])
          return
        }
        await upsertAgentModerationVotesWithTrainingEvidence(
          user.id,
          [
            {
              entityId: args.id,
              score: clear ? null : getElectionVoteChoiceScore('moderation', args.choice!),
            },
          ],
          { ipAddress: null, deviceId: null, sessionId: null, userAgent: null },
          'agent',
        )
      })
      return { success: true }
    },
  })
}
export const adminAgentVoteTools = [
  agentVoteTool('set_agent_moderation_vote', false),
  agentVoteTool('clear_agent_moderation_vote', true),
]
