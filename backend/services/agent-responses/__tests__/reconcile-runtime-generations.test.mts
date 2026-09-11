import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  setChatAgenticRunStartedAt,
  softDeleteTestConversationMessage,
} from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
  createConversationMessageAgenticRun,
} from '../../conversations-messages/create.mts'
import {
  getConversationById,
  updateConversationLastResponseId,
} from '../../conversations-messages/conversations.mts'
import { getConversationMessageAgenticRunById } from '../../conversations-messages/agentic-runs.mts'
import { reconcileStaleRuntimeGenerations } from '../reconcile-runtime-generations.mts'

describe('reconcileStaleRuntimeGenerations missing message', () => {
  it('counts a stale run CAS and clears its non-OpenAI cursor when the message is deleted', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Deleted stale assistant')
    await updateConversationLastResponseId(conversation.id, 'response_anthropic')
    const message = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: 'partial',
    })
    const run = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: message.id,
      modelName: 'claude-sonnet-5',
      modelProvider: 'anthropic',
      input: {},
    })
    const startedAt = new Date('1901-01-01T00:00:00Z')
    await setChatAgenticRunStartedAt(run.id, startedAt)
    await softDeleteTestConversationMessage(message.id, user.id)

    await expect(
      reconcileStaleRuntimeGenerations({
        cutoff: new Date('2000-01-01T00:00:00Z'),
        candidates: [
          {
            kind: 'chat',
            id: run.id,
            signalJobId: `chat_${message.id}`,
            startedAt,
          },
        ],
      }),
    ).resolves.toEqual({ agentResponses: 0, chats: 1, agentResponseIds: [] })
    await expect(getConversationMessageAgenticRunById(run.id)).resolves.toMatchObject({
      status: 'failed',
    })
    await expect(getConversationById(conversation.id)).resolves.toMatchObject({
      last_response_id: null,
    })
  })
})
